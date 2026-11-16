import { Modal, type App } from "obsidian";
import type { CollectSession, JobView, Stage } from "../collect/session";
import { t } from "../i18n";
import type { Attachment } from "../sources/types";
import { iconLabel } from "./dom";

const ORDER: Stage[] = ["receive", "convert", "summarize", "save"];

export class ProgressModal extends Modal {
  private unsubscribe: (() => void) | null = null;
  private chooser: ((file: Attachment | null) => void) | null = null;

  constructor(
    app: App,
    private readonly session: CollectSession,
    private readonly openPath: (path: string) => void,
    private readonly onShare: () => void,
    private readonly onRetry: (job: JobView) => void,
  ) {
    super(app);
  }

  onOpen(): void {
    this.modalEl.addClass("labsidian");
    this.modalEl.addClass("lab-modal-progress");
    this.unsubscribe = this.session.subscribe(() => this.paint());
    this.paint();
  }

  onClose(): void {
    this.unsubscribe?.();
    this.chooser?.(null);
    this.contentEl.empty();
  }

  choose(files: Attachment[]): Promise<Attachment | null> {
    return new Promise((resolve) => {
      this.chooser = resolve;
      const host = this.contentEl.querySelector(".lab-choose");
      const slot = host ?? this.contentEl.createDiv({ cls: "lab-choose lab-card" });
      slot.empty();
      slot.createEl("p", { text: "첨부가 여러 개예요. 노트로 만들 파일을 고르세요." });
      for (const file of files) {
        const button = slot.createEl("button", { cls: "lab-btn", text: file.name });
        button.addEventListener("click", () => {
          this.chooser = null;
          slot.remove();
          resolve(file);
        });
      }
    });
  }

  private paint(): void {
    const root = this.contentEl;
    root.empty();
    root.addClass("labsidian");
    const shell = root.createDiv({ cls: "lab-progress" });
    shell.createEl("h3", { text: t("progress.title") });
    iconLabel(shell, "info", t("progress.keepGoing"));
    const total = this.session.jobs.length;
    const done = this.session.doneCount;
    const bar = shell.createDiv({ cls: "lab-bar" });
    bar.createSpan({ attr: { style: `width:${total ? Math.round((done / total) * 100) : 0}%` } });
    shell.createDiv({ cls: "lab-note", text: t("progress.status", { done, total }) });
    for (const job of this.session.jobs) this.paintJob(shell, job);
    if (this.session.finished) {
      const share = shell.createEl("button", { cls: "lab-btn is-primary", text: t("progress.share") });
      share.addEventListener("click", () => this.onShare());
    }
  }

  private paintJob(shell: HTMLElement, job: JobView): void {
    const row = shell.createDiv({ cls: "lab-job" });
    const icon = job.stage === "done" ? "check" : job.stage === "error" ? "alert-triangle" : job.stage === "cancelled" ? "x" : "loader";
    iconLabel(row, icon, "");
    const main = row.createDiv();
    main.createDiv({ cls: "lab-title", text: job.title });
    const stages = main.createDiv({ cls: "lab-stages" });
    for (const stage of ORDER) {
      const cls = stage === job.stage ? "is-now" : stageRank(job.stage) > stageRank(stage) ? "is-done" : "";
      stages.createSpan({ cls: `lab-stage ${cls}`, text: t(`progress.${stage}`) });
    }
    if (job.stage === "convert" && job.pages) {
      const pageBar = main.createDiv({ cls: "lab-bar" });
      const width = Math.round(((job.page ?? 0) / job.pages) * 100);
      pageBar.createSpan({ attr: { style: `width:${width}%` } });
      main.createDiv({ cls: "lab-note", text: t("progress.pages", { page: job.page ?? 0, pages: job.pages }) });
    }
    if (job.error) main.createDiv({ cls: "lab-note", text: job.error });
    const action = row.createEl("button", { cls: "lab-btn" });
    if (job.stage === "done" && job.path) {
      action.setText(t("progress.openNote"));
      action.addEventListener("click", () => job.path && this.openPath(job.path));
    } else if (job.stage === "error") {
      action.setText(job.hasPdf ? t("progress.retry") : t("progress.openSource"));
      action.addEventListener("click", () => {
        if (!job.hasPdf) window.open(job.url);
        else this.onRetry(job);
      });
    } else if (job.stage === "cancelled" || job.stage === "done") {
      action.setText(t("progress.openSource"));
      action.addEventListener("click", () => window.open(job.url));
    } else {
      action.setText(t("progress.cancel"));
      action.addEventListener("click", () => this.session.cancel(job.id));
    }
  }
}

function stageRank(stage: Stage): number {
  switch (stage) {
    case "wait":
      return 0;
    case "receive":
      return 1;
    case "convert":
      return 2;
    case "summarize":
      return 3;
    case "save":
      return 4;
    case "done":
    case "error":
    case "cancelled":
      return 5;
    default: {
      const exhaustive: never = stage;
      return exhaustive;
    }
  }
}
