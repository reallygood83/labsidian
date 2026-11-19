import { Modal, type App } from "obsidian";
import { formatDotDate, t } from "../i18n";
import type { SecretStore } from "../secrets";
import { SECRET } from "../secrets";
import type { LabsidianSettings } from "../settings";
import { searchSources } from "../sources/search";
import { SOURCES } from "../sources/registry";
import type { HttpClient } from "../http/types";
import type { SearchGroup, SearchHit, SourceContext, SourceId } from "../sources/types";
import { findDuplicate, previewLines, saveButtonLabel, yearOf, type SavedIdentity } from "../collect/usability";
import { iconLabel, spinner } from "./dom";

export interface SearchLaunch {
  settings: LabsidianSettings;
  secrets: SecretStore;
  http: HttpClient;
  savedIds: Set<string>;
  saved: SavedIdentity[];
  initialQuery: string;
  onRemember: (query: string) => void;
  onOpen: (path: string) => void;
  onCollect: (hits: SearchHit[], query: string, summarize: boolean) => void;
}

type SortMode = "relevance" | "newest" | "oldest";

export class SearchModal extends Modal {
  private readonly launch: SearchLaunch;
  private query = "";
  private enabled = new Set<SourceId>();
  private keys: Partial<Record<SourceId, string>> = {};
  private groups: SearchGroup[] = [];
  private loading = new Set<SourceId>();
  private checked = new Set<string>();
  private previewId = "";
  private year = "";
  private kind = "";
  private pdfOnly = false;
  private sort: SortMode = "relevance";
  private summarize = false;
  private timer = 0;
  private input: HTMLInputElement | null = null;
  private body: HTMLElement | null = null;
  private request = 0;

  constructor(app: App, launch: SearchLaunch) {
    super(app);
    this.launch = launch;
  }

  onOpen(): void {
    this.modalEl.addClass("labsidian");
    this.modalEl.addClass("lab-modal-search");
    void this.boot();
  }

  onClose(): void {
    window.clearTimeout(this.timer);
    this.input = null;
    this.body = null;
    this.contentEl.empty();
  }

  private async boot(): Promise<void> {
    const [kci, riss, openalex] = await Promise.all([
      this.launch.secrets.get(SECRET.kci),
      this.launch.secrets.get(SECRET.riss),
      this.launch.secrets.get(SECRET.openalex),
    ]);
    this.keys = { kci: kci ?? "", riss: riss ?? "", openalex: openalex ?? "" };
    for (const source of SOURCES) {
      if (!this.launch.settings.sources[source.id]) continue;
      if (source.requiresKey && !this.keys[source.id]) continue;
      this.enabled.add(source.id);
    }
    this.summarize = this.launch.settings.aiEnabled;
    this.query = this.launch.initialQuery;
    this.paint();
    if (this.query.trim()) void this.runSearch();
    this.input?.focus();
  }

  /**
   * The search box is built once and never replaced. Rebuilding it on every result
   * dropped focus mid-typing, so Backspace (and Korean IME composition) stopped
   * reaching the box. Only the part below the box is redrawn.
   */
  private paint(): void {
    if (!this.body || !this.input) {
      const root = this.contentEl;
      root.empty();
      root.addClass("labsidian");
      const frame = root.createDiv({ cls: "lab-search" });
      this.paintHead(frame);
      this.body = frame.createDiv({ cls: "lab-search-body" });
    }
    const input = this.input;
    const shell = this.body;
    if (!input || !shell) return;
    if (input.value !== this.query) input.value = this.query;
    shell.empty();
    this.paintFilters(shell);
    this.paintBanners(shell);
    const hits = this.visibleHits();
    if (!this.query && this.groups.length === 0 && this.loading.size === 0) {
      this.paintEmpty(shell);
    } else if (this.query && hits.length === 0 && this.loading.size === 0) {
      shell.createDiv({ cls: "lab-empty", text: t("search.noResult", { query: this.query }) });
    } else {
      this.paintSplit(shell, hits);
    }
    this.paintFooter(shell, hits);
  }

  private paintHead(shell: HTMLElement): void {
    const head = shell.createDiv({ cls: "lab-search-head" });
    const input = head.createEl("input", { cls: "lab-search-input", attr: { placeholder: t("search.placeholder") } });
    input.value = this.query;
    this.input = input;
    input.addEventListener("input", () => {
      this.query = input.value;
      window.clearTimeout(this.timer);
      this.timer = window.setTimeout(() => void this.runSearch(), 300);
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        this.move(1);
      }
    });
    head.createSpan({ cls: "lab-kbd", text: "Esc" });
  }

  private paintFilters(shell: HTMLElement): void {
    const row = shell.createDiv({ cls: "lab-filters" });
    for (const source of SOURCES) {
      const locked = source.requiresKey && !this.keys[source.id];
      const chip = row.createEl("button", {
        cls: `lab-chip${this.enabled.has(source.id) ? " is-on" : ""}${locked ? " is-locked" : ""}`,
        attr: { type: "button", "data-source": source.id },
      });
      if (this.enabled.has(source.id)) chip.createSpan({ cls: "lab-dot" });
      chip.createSpan({ text: source.label });
      const count = this.groups.find((group) => group.source === source.id)?.hits.length;
      if (this.loading.has(source.id)) spinner(chip);
      else if (typeof count === "number") chip.createSpan({ text: t("search.count", { count }) });
      if (locked) chip.createSpan({ text: source.id === "riss" ? t("search.needInstitutionKey") : t("search.needKey") });
      chip.disabled = locked;
      chip.addEventListener("click", () => {
        if (locked) return;
        if (this.enabled.has(source.id)) this.enabled.delete(source.id);
        else this.enabled.add(source.id);
        void this.runSearch();
      });
    }
    const years = [...new Set(this.groups.flatMap((group) => group.hits.map((hit) => hit.published.slice(0, 4))).filter((year) => year.length === 4))];
    const year = row.createEl("select", { cls: "lab-select", attr: { "aria-label": t("search.year") } });
    year.createEl("option", { text: t("search.yearAll"), value: "" });
    for (const value of years) year.createEl("option", { text: value, value });
    year.value = this.year;
    year.addEventListener("change", () => {
      this.year = year.value;
      this.paint();
    });
    const kinds = [...new Set(this.groups.flatMap((group) => group.hits.map((hit) => hit.docType)).filter(Boolean))];
    const kind = row.createEl("select", { cls: "lab-select", attr: { "aria-label": t("search.type") } });
    kind.createEl("option", { text: t("search.typeAll"), value: "" });
    for (const value of kinds) kind.createEl("option", { text: value, value });
    kind.value = this.kind;
    kind.addEventListener("change", () => {
      this.kind = kind.value;
      this.paint();
    });
    const pdf = row.createEl("label", { cls: "lab-check" });
    const box = pdf.createEl("input", { attr: { type: "checkbox" } });
    box.checked = this.pdfOnly;
    pdf.createSpan({ text: t("search.pdfOnly") });
    box.addEventListener("change", () => {
      this.pdfOnly = box.checked;
      this.paint();
    });
    const sort = row.createEl("select", { cls: "lab-select", attr: { "aria-label": t("search.sort") } });
    sort.createEl("option", { text: t("search.sortRelevance"), value: "relevance" });
    sort.createEl("option", { text: t("search.sortNewest"), value: "newest" });
    sort.createEl("option", { text: t("search.sortOldest"), value: "oldest" });
    sort.value = this.sort;
    sort.addEventListener("change", () => {
      this.sort = sort.value as SortMode;
      this.paint();
    });
  }

  private paintBanners(shell: HTMLElement): void {
    const failed = this.groups.filter((group) => group.error);
    if (!failed.length) return;
    const banner = shell.createDiv({ cls: "lab-banner" });
    const text = banner.createDiv();
    for (const group of failed) {
      iconLabel(text, "alert-triangle", group.error ?? "");
    }
    const retry = banner.createEl("button", { cls: "lab-btn", text: t("search.retry") });
    retry.addEventListener("click", () => void this.runSearch());
  }

  private paintEmpty(shell: HTMLElement): void {
    const empty = shell.createDiv({ cls: "lab-empty" });
    empty.createEl("p", { text: t("search.emptyTitle") });
    empty.createEl("p", { cls: "lab-note", text: t("search.emptyHint") });
    const row = empty.createDiv({ cls: "lab-filters" });
    for (const recent of this.launch.settings.recentQueries) {
      const chip = row.createEl("button", { cls: "lab-chip", text: recent });
      chip.addEventListener("click", () => {
        this.query = recent;
        void this.runSearch();
      });
    }
  }

  private paintSplit(shell: HTMLElement, hits: SearchHit[]): void {
    const split = shell.createDiv({ cls: "lab-split" });
    const list = split.createDiv({ cls: "lab-list" });
    hits.forEach((hit, index) => {
      const duplicate = findDuplicate(hit, this.launch.saved);
      const saved = Boolean(duplicate);
      const row = list.createDiv({ cls: `lab-hit${this.previewId === hit.sourceId ? " is-active" : ""}${saved ? " is-saved" : ""}` });
      const box = row.createEl("input", { attr: { type: "checkbox" } });
      box.checked = this.checked.has(hit.sourceId);
      box.disabled = saved;
      box.addEventListener("click", (event) => event.stopPropagation());
      box.addEventListener("change", () => {
        if (saved) return;
        if (box.checked) this.checked.add(hit.sourceId);
        else this.checked.delete(hit.sourceId);
        this.paint();
      });
      const main = row.createDiv();
      main.createDiv({ cls: "lab-title", text: hit.title });
      const meta = main.createDiv({ cls: "lab-meta" });
      meta.createSpan({ cls: "lab-badge", text: labelOf(hit.source), attr: { "data-source": hit.source } });
      if (hit.docType) meta.createSpan({ text: hit.docType });
      const year = yearOf(hit.published);
      if (year) meta.createSpan({ text: year });
      if (hit.hasPdf) meta.createSpan({ cls: "lab-badge is-pdf", text: "PDF 있음" });
      const preview = previewLines(hit.abstract);
      if (preview) main.createDiv({ cls: "lab-hit-preview", text: preview });
      if (saved && duplicate) {
        const savedBadge = meta.createSpan({ cls: "lab-badge is-saved" });
        savedBadge.createSpan({ text: "이미 있어요" });
        const open = meta.createEl("button", { cls: "lab-btn", text: "열기" });
        open.addEventListener("click", (event) => {
          event.stopPropagation();
          this.launch.onOpen(duplicate.path);
        });
      }
      row.addEventListener("click", () => {
        this.previewId = hit.sourceId;
        this.paint();
      });
      row.tabIndex = 0;
      row.addEventListener("keydown", (event) => {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          this.move(1, index);
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          this.move(-1, index);
        }
        if (event.key === " " && !saved) {
          event.preventDefault();
          if (this.checked.has(hit.sourceId)) this.checked.delete(hit.sourceId);
          else this.checked.add(hit.sourceId);
          this.paint();
        }
      });
    });
    const preview = split.createDiv({ cls: "lab-preview" });
    const current = hits.find((hit) => hit.sourceId === this.previewId) ?? hits[0];
    if (!current) {
      preview.createDiv({ cls: "lab-note", text: t("search.previewEmpty") });
      return;
    }
    this.previewId = current.sourceId;
    preview.createEl("h3", { text: current.title });
    preview.createDiv({ cls: "lab-meta", text: `${current.publisher} · ${formatDotDate(current.published)}` });
    if (current.abstract) preview.createDiv({ cls: "lab-abstract", text: current.abstract });
    const card = preview.createDiv({ cls: "lab-card" });
    iconLabel(card, "file-text", t("search.attachment"));
    const toggle = preview.createEl("label", { cls: "lab-check" });
    const ai = toggle.createEl("input", { attr: { type: "checkbox" } });
    ai.checked = this.summarize;
    toggle.createSpan({ text: t("search.summaryToggle") });
    ai.addEventListener("change", () => {
      this.summarize = ai.checked;
    });
  }

  private paintFooter(shell: HTMLElement, hits: SearchHit[]): void {
    const footer = shell.createDiv({ cls: "lab-footer" });
    footer.createSpan({ cls: "lab-footer-hints", text: t("search.keys") });
    const right = footer.createDiv({ cls: "lab-row" });
    const chosen = hits.filter((hit) => this.checked.has(hit.sourceId) && !this.launch.savedIds.has(hit.sourceId));
    right.createSpan({ text: t("search.selected", { count: chosen.length }) });
    const save = right.createEl("button", { cls: "lab-btn is-primary", text: saveButtonLabel(chosen.length) });
    save.disabled = chosen.length === 0;
    save.addEventListener("click", () => {
      this.launch.onCollect(chosen, this.query, this.summarize);
      this.close();
    });
  }

  private visibleHits(): SearchHit[] {
    let hits = this.groups.flatMap((group) => group.hits);
    if (this.year) hits = hits.filter((hit) => hit.published.startsWith(this.year));
    if (this.kind) hits = hits.filter((hit) => hit.docType === this.kind);
    if (this.pdfOnly) hits = hits.filter((hit) => hit.hasPdf);
    if (this.sort === "newest") hits = [...hits].sort((a, b) => b.published.localeCompare(a.published));
    if (this.sort === "oldest") hits = [...hits].sort((a, b) => a.published.localeCompare(b.published));
    return hits;
  }

  private move(step: number, from = -1): void {
    const hits = this.visibleHits();
    if (!hits.length) return;
    const index = from >= 0 ? from : hits.findIndex((hit) => hit.sourceId === this.previewId);
    const next = hits[Math.min(hits.length - 1, Math.max(0, index + step))];
    if (!next) return;
    this.previewId = next.sourceId;
    this.paint();
  }

  private async runSearch(): Promise<void> {
    const query = this.query.trim();
    this.groups = [];
    this.loading = new Set(this.enabled);
    this.paint();
    if (!query) {
      this.loading.clear();
      this.paint();
      return;
    }
    const token = ++this.request;
    this.launch.onRemember(query);
    const ctx: SourceContext = {
      http: this.launch.http,
      keys: this.keys,
      openalexMailto: this.launch.settings.openalexMailto,
    };
    const sources = SOURCES.filter((source) => this.enabled.has(source.id));
    await searchSources(sources, query, ctx, (group) => {
      if (token !== this.request) return;
      this.loading.delete(group.source);
      this.groups = [...this.groups.filter((item) => item.source !== group.source), group];
      this.paint();
    });
  }
}

function labelOf(id: SourceId): string {
  switch (id) {
    case "kofic":
      return "영진위";
    case "kocca":
      return "콘진원";
    case "openalex":
      return "OpenAlex";
    case "kci":
      return "KCI";
    case "riss":
      return "RISS";
    default: {
      const exhaustive: never = id;
      return exhaustive;
    }
  }
}
