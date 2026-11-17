import { Notice, PluginSettingTab, Setting, type App, type Plugin } from "obsidian";
import type { LabsidianHost } from "../host";
import { t } from "../i18n";
import { SECRET } from "../secrets";
import type { AiProvider, FieldToggles } from "../settings";
import { SOURCES } from "../sources/registry";
import type { SourceId } from "../sources/types";
import { askConfirm } from "./confirmModal";
import { setupSteps } from "../../packages/shared/team";
import { parseFirebaseWebConfig } from "../team/auth";
import { createSecretField, createSettingGroup } from "../types/obsidian";

const FIELD_LABELS: { key: keyof FieldToggles; label: string }[] = [
  { key: "series", label: "series" },
  { key: "type", label: "type" },
  { key: "publisher", label: "publisher" },
  { key: "author", label: "author" },
  { key: "published", label: "published" },
  { key: "pdfUrl", label: "pdf_url" },
  { key: "query", label: "query" },
  { key: "keywords", label: "keywords" },
  { key: "converter", label: "converter" },
  { key: "convertWarnings", label: "convert_warnings" },
  { key: "summaryModel", label: "summary_model" },
  { key: "teamShared", label: "team_shared" },
  { key: "tags", label: "tags" },
];

export class LabsidianSettingTab extends PluginSettingTab {
  private tab: "sources" | "notes" | "ai" | "team" | "about" = "sources";

  constructor(app: App, private readonly plugin: LabsidianHost & Plugin) {
    super(app, plugin);
  }

  display(): void {
    const root = this.containerEl;
    root.empty();
    root.addClass("labsidian");
    root.addClass("lab-settings");
    this.modeChoice(root);
    const tabs = root.createDiv({ cls: "lab-tabs" });
    for (const id of ["sources", "notes", "ai", "team", "about"] as const) {
      const button = tabs.createEl("button", { cls: `lab-tab${this.tab === id ? " is-on" : ""}`, text: t(`settings.${id}`) });
      button.addEventListener("click", () => {
        this.tab = id;
        this.display();
      });
    }
    if (this.tab === "sources") this.sources(root);
    if (this.tab === "notes") this.notes(root);
    if (this.tab === "ai") this.ai(root);
    if (this.tab === "team") this.team(root);
    if (this.tab === "about") this.about(root);
  }

  private modeChoice(root: HTMLElement): void {
    const card = root.createDiv({ cls: "lab-card" });
    card.createEl("p", { cls: "lab-title", text: this.modeTitle() });
    card.createEl("p", { cls: "lab-note", text: this.plugin.settings.libraryMode === "team" ? "팀으로 쓰는 중이에요." : this.plugin.settings.libraryMode === "personal" ? "내 클라우드에 혼자 쓰는 중이에요." : "혼자 쓰기예요. 노트는 이 볼트에만 있어요." });
    const row = card.createDiv({ cls: "lab-row" });
    const solo = row.createEl("button", { cls: `lab-btn${this.plugin.settings.libraryMode === "solo" ? " is-primary" : ""}`, text: "혼자 쓰기" });
    const team = row.createEl("button", { cls: `lab-btn${this.plugin.settings.libraryMode === "team" ? " is-primary" : ""}`, text: "팀으로 쓰기" });
    solo.addEventListener("click", () => {
      void this.chooseMode("solo");
    });
    team.addEventListener("click", () => {
      void this.chooseMode("team");
    });
    if (this.plugin.settings.libraryMode !== "team") {
      const cloud = card.createEl("button", { cls: "lab-btn", text: "내 클라우드 연결" });
      cloud.addEventListener("click", () => {
        void this.plugin.connectPersonalLibrary().then((message) => {
          new Notice(message);
          this.display();
        }).catch((error: unknown) => new Notice(error instanceof Error ? error.message : "내 클라우드를 연결하지 못했어요. 웹 설정을 저장하고 로그인해 주세요."));
      });
      const visibility = card.createEl("label", { cls: "lab-check" });
      const toggle = visibility.createEl("input", { attr: { type: "checkbox" } });
      toggle.checked = this.plugin.settings.shareOnBriefing;
      visibility.createSpan({ text: "브리핑에 공개" });
      card.createEl("p", { cls: "lab-note", text: "기본은 나만 보기예요. 공개로 고른 글만 브리핑에 나와요." });
      toggle.addEventListener("change", () => {
        if (!toggle.checked) {
          this.plugin.settings.shareOnBriefing = false;
          void this.plugin.saveSettings();
          return;
        }
        void askConfirm(this.app, "브리핑에 공개", "이 글을 올리면 인터넷에 공개돼요. 링크를 아는 사람이 볼 수 있어요.").then((ok) => {
          if (!ok) {
            toggle.checked = false;
            return;
          }
          this.plugin.settings.shareOnBriefing = true;
          void this.plugin.saveSettings();
        });
      });
    }
    const again = card.createEl("button", { cls: "lab-btn", text: "안내 다시 보기" });
    again.addEventListener("click", () => {
      this.plugin.settings.tourSeen = false;
      void this.plugin.saveSettings();
      this.plugin.openTour();
    });
    if (this.plugin.settings.libraryMode === "personal") {
      const move = card.createEl("button", { cls: "lab-btn", text: "팀 서고로 옮기기" });
      move.addEventListener("click", () => {
        void askConfirm(this.app, "팀 서고로 옮기기", "공개로 둔 글은 인터넷에 공개돼요. 비공개 글은 그대로 나만 봐요.").then((ok) => {
          if (!ok) return;
          void this.plugin.movePersonalNotesToTeam().then((message) => {
          new Notice(message);
          this.display();
        }).catch((error: unknown) => new Notice(error instanceof Error ? error.message : "글을 옮기지 못했어요. 로그인 상태를 확인해 주세요."));
        });
      });
    }
  }

  private modeTitle(): string {
    const project = Boolean(this.plugin.settings.firebaseProjectId);
    if (this.plugin.settings.libraryMode === "team") return project ? "팀 서고에 연결됨" : "팀으로 쓰기";
    if (this.plugin.settings.libraryMode === "personal") return project ? "내 클라우드에 연결됨" : "내 클라우드";
    return "혼자 쓰기";
  }

  private async chooseMode(mode: "solo" | "team"): Promise<void> {
    if (mode === "solo") {
      this.plugin.settings.libraryMode = "solo";
      await this.plugin.saveSettings();
      this.display();
      return;
    }
    this.plugin.settings.libraryMode = "team";
    await this.plugin.saveSettings();
    this.display();
  }

  private sources(root: HTMLElement): void {
    const grid = root.createDiv({ cls: "lab-sources" });
    for (const source of SOURCES) {
      const card = grid.createDiv({ cls: "lab-card lab-source-card" });
      const head = card.createDiv({ cls: "lab-row" });
      head.createDiv({ cls: "lab-logo", attr: { "data-source": source.id }, text: short(source.id) });
      head.createDiv({ cls: "lab-title", text: source.label });
      const needsKey = source.requiresKey;
      const secretId = source.id === "kci" ? SECRET.kci : source.id === "riss" ? SECRET.riss : source.id === "openalex" ? SECRET.openalex : "";
      const hasKey = secretId ? this.plugin.secrets.has(secretId) : true;
      new Setting(card).setName("사용").addToggle((toggle) => {
        toggle.setValue(Boolean(this.plugin.settings.sources[source.id]) && (!needsKey || hasKey));
        toggle.setDisabled(needsKey && !hasKey);
        toggle.onChange(async (value) => {
          this.plugin.settings.sources[source.id] = value;
          await this.plugin.saveSettings();
        });
      });
      card.createEl("p", { cls: "lab-note", text: source.blurb });
      if (secretId) this.secretRow(card, secretId, source.keyHint);
      const status = card.createDiv({ cls: "lab-statusline" });
      const state = !hasKey && needsKey ? t("search.needKey") : source.id === "openalex" && !hasKey ? t("settings.sharedQuota") : t("settings.connected");
      status.createSpan({ cls: "lab-saved-dot" });
      status.createSpan({ text: state });
      const test = card.createEl("button", { cls: "lab-btn", text: t("settings.test") });
      test.addEventListener("click", () => {
        void this.plugin.testSource(source.id).then((message) => new Notice(message));
      });
    }
  }

  private secretRow(card: HTMLElement, id: string, hint: string): void {
    const host = card.createDiv();
    const field = createSecretField(this.app, host);
    if (field) {
      const current = this.plugin.secrets.has(id);
      if (current) field.setValue("••••");
      field.onChange((value) => {
        void this.storeSecret(id, value ?? "");
      });
    }
    if (hint) card.createEl("p", { cls: "lab-note", text: hint });
    const clear = card.createEl("button", { cls: "lab-btn", text: t("settings.clearKey") });
    clear.addEventListener("click", () => {
      void this.storeSecret(id, "");
    });
  }

  private async storeSecret(id: string, value: string): Promise<void> {
    if (!value) {
      await this.plugin.secrets.remove(id);
      if (id === SECRET.kci) this.plugin.settings.sources.kci = false;
      if (id === SECRET.riss) this.plugin.settings.sources.riss = false;
    } else if (value !== "••••") {
      await this.plugin.secrets.set(id, value);
    }
    await this.plugin.saveSettings();
    this.display();
  }

  private notes(root: HTMLElement): void {
    const group = this.group(root, t("settings.notes"));
    new Setting(group).setName(t("settings.folder")).addText((text) => {
      text.setValue(this.plugin.settings.noteFolder).onChange(async (value) => {
        this.plugin.settings.noteFolder = value.trim() || "연구자료";
        await this.plugin.saveSettings();
      });
    });
    new Setting(group).setName(t("settings.filename")).setDesc(t("settings.filenameHint")).addText((text) => {
      text.setValue(this.plugin.settings.filenameTemplate).onChange(async (value) => {
        this.plugin.settings.filenameTemplate = value.trim() || "{{series}} {{title}}";
        await this.plugin.saveSettings();
      });
    });
    new Setting(group).setName(t("settings.fields")).setHeading();
    for (const field of FIELD_LABELS) {
      new Setting(group).setName(field.label).addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.fields[field.key]).onChange(async (value) => {
          this.plugin.settings.fields[field.key] = value;
          await this.plugin.saveSettings();
        });
      });
    }
  }

  private ai(root: HTMLElement): void {
    const group = this.group(root, t("settings.ai"));
    new Setting(group).setName(t("settings.provider")).addDropdown((dropdown) => {
      dropdown.addOption("gemini", "Gemini");
      dropdown.addOption("openai", "OpenAI");
      dropdown.addOption("anthropic", "Anthropic");
      dropdown.setValue(this.plugin.settings.aiProvider).onChange(async (value) => {
        this.plugin.settings.aiProvider = value as AiProvider;
        await this.plugin.saveSettings();
        this.display();
      });
    });
    const secretId = SECRET[this.plugin.settings.aiProvider];
    this.secretRow(group, secretId, "키는 키체인에만 저장해요.");
    new Setting(group).setName(t("settings.model")).addText((text) => {
      text.setValue(this.plugin.settings.aiModels[this.plugin.settings.aiProvider]).onChange(async (value) => {
        this.plugin.settings.aiModels[this.plugin.settings.aiProvider] = value.trim();
        await this.plugin.saveSettings();
      });
    });
    new Setting(group).setName(t("settings.range")).addDropdown((dropdown) => {
      dropdown.addOption("excerpt", t("settings.rangeExcerpt"));
      dropdown.addOption("full", t("settings.rangeFull"));
      dropdown.setValue(this.plugin.settings.sendFullText ? "full" : "excerpt").onChange(async (value) => {
        this.plugin.settings.sendFullText = value === "full";
        await this.plugin.saveSettings();
      });
    });
    new Setting(group).setName(t("settings.daily")).addText((text) => {
      text.setValue(String(this.plugin.settings.dailySummaryLimit)).onChange(async (value) => {
        const count = Number(value);
        if (Number.isFinite(count)) this.plugin.settings.dailySummaryLimit = Math.max(0, Math.floor(count));
        await this.plugin.saveSettings();
      });
    });
    new Setting(group).setName("AI").addToggle((toggle) => {
      toggle.setValue(this.plugin.settings.aiEnabled).onChange(async (value) => {
        this.plugin.settings.aiEnabled = value;
        await this.plugin.saveSettings();
      });
    });
  }

  private team(root: HTMLElement): void {
    const steps = root.createDiv({ cls: "lab-card" });
    new Setting(steps).setName("팀 서고 만들기").setHeading();
    setupSteps(this.plugin.settings.firebaseProjectId).forEach((step, index) => {
      const row = steps.createDiv({ cls: "lab-row" });
      row.createSpan({ text: `${index + 1}. ${step.title}` });
      row.createSpan({ cls: "lab-note", text: step.detail });
      const open = row.createEl("button", { cls: "lab-btn", text: "콘솔 열기" });
      open.addEventListener("click", () => window.open(step.href, "_blank"));
    });
    const copyRules = steps.createEl("button", { cls: "lab-btn", text: "규칙 복사" });
    copyRules.addEventListener("click", () => {
      void this.plugin.rulesForMe().then((rules) => navigator.clipboard.writeText(rules)).then(
        () => new Notice("규칙을 복사했어요. 내 계정이 들어 있어요. Firestore 규칙 편집기에 붙여 넣고 게시해요."),
        () => new Notice("규칙을 복사하지 못했어요. 로그인한 뒤 다시 눌러 주세요."),
      );
    });

    const group = this.group(root, t("settings.team"));
    if (this.plugin.settings.firebaseProjectId) {
      group.createEl("p", { cls: "lab-note", text: "웹 설정이 저장되어 있어요. JSON은 다시 보여 주지 않아요." });
    }
    const box = group.createEl("textarea", { cls: "lab-search-input", attr: { rows: "4" } });
    box.placeholder = '{"apiKey":"","projectId":""}';
    const check = group.createEl("button", { cls: "lab-btn", text: t("settings.firebaseCheck") });
    check.addEventListener("click", async () => {
      try {
        const parsed = parseFirebaseWebConfig(box.value);
        this.plugin.settings.firebaseProjectId = parsed.projectId;
        this.plugin.settings.firebaseApiKey = parsed.apiKey;
        this.plugin.settings.firebaseEnabled = true;
        await this.plugin.saveSettings();
        new Notice("Firebase 웹 설정을 확인했어요.");
      } catch (error) {
        new Notice(error instanceof Error ? error.message : "설정을 확인하지 못했어요.");
      }
    });
    new Setting(group).setName("이메일").addText((text) => {
      text.setValue(this.plugin.settings.firebaseEmail).onChange(async (value) => {
        this.plugin.settings.firebaseEmail = value.trim();
        await this.plugin.saveSettings();
      });
    });
    let password = "";
    new Setting(group).setName("비밀번호").addText((text) => {
      text.inputEl.type = "password";
      text.onChange((value) => {
        password = value;
      });
    });
    const login = group.createEl("button", { cls: "lab-btn is-primary", text: t("settings.login") });
    login.addEventListener("click", () => {
      void this.plugin.login(password).then((message) => new Notice(message));
    });
    const signup = group.createEl("button", { cls: "lab-btn", text: t("settings.signup") });
    signup.addEventListener("click", () => {
      void this.plugin.signUpEmail(password).then((message) => new Notice(message)).catch((error: unknown) => {
        new Notice(error instanceof Error ? `${error.message} ${t("upload.vaultSafe")}` : t("upload.vaultSafe"));
      });
    });
    const resend = group.createEl("button", { cls: "lab-btn", text: "인증 메일 다시 보내기" });
    resend.addEventListener("click", () => {
      void this.plugin.resendVerificationEmail().then((message) => new Notice(message)).catch((error: unknown) => {
        new Notice(error instanceof Error ? error.message : "인증 메일을 다시 보내지 못했어요.");
      });
    });
    let google = "";
    new Setting(group).setName(t("settings.google")).addText((text) => text.onChange((value) => {
      google = value.trim();
    }));
    const googleButton = group.createEl("button", { cls: "lab-btn", text: t("settings.login") });
    googleButton.addEventListener("click", () => {
      void this.plugin.loginWithGoogle(google).then((message) => new Notice(message));
    });
    new Setting(group).setName("팀 이름").addText((text) => {
      text.setValue(this.plugin.settings.teamName).onChange(async (value) => {
        this.plugin.settings.teamName = value.trim().slice(0, 80);
        await this.plugin.saveSettings();
      });
    });
    const nameLocked = Boolean(this.plugin.settings.teamId) && this.plugin.settings.libraryMode !== "personal";
    new Setting(group).setName("표시 이름").setDesc(nameLocked ? "가입한 뒤에는 바꿀 수 없어요. 글에는 가입할 때 정한 이름이 올라가요." : "1자에서 80자예요. 메일 주소는 쓰지 않아요.").addText((text) => {
      text.setValue(this.plugin.settings.displayName).setDisabled(nameLocked).onChange(async (value) => {
        if (nameLocked) return;
        this.plugin.settings.displayName = value.trim().slice(0, 80);
        await this.plugin.saveSettings();
      });
    });
    const logged = this.plugin.secrets.has(SECRET.firebaseRefresh);
    group.createEl("p", {
      cls: "lab-note",
      text: logged ? t("settings.loggedIn", { email: this.plugin.settings.firebaseEmail || "팀원" }) : t("settings.loggedOut"),
    });
    if (logged && this.plugin.settings.firebaseProjectId && this.plugin.settings.firebaseApiKey) {
      this.inviteTools(group);
    }
    new Setting(group).setName(t("settings.briefingUrl")).addText((text) => {
      text.setValue(this.plugin.settings.briefingUrl).onChange(async (value) => {
        this.plugin.settings.briefingUrl = value.trim();
        await this.plugin.saveSettings();
      });
    });
    group.createEl("p", {
      cls: "lab-note",
      text: this.plugin.settings.lastSyncAt
        ? `${t("settings.sync")} ${this.plugin.settings.lastSyncAt} · ${this.plugin.settings.lastSyncCount}`
        : t("settings.syncEmpty"),
    });
  }

  private inviteTools(group: HTMLElement): void {
    const card = group.createDiv({ cls: "lab-card" });
    card.createEl("p", { text: "팀코드를 정하면 초대 링크가 생겨요. 코드를 바꾸면 이전 링크는 멈춰요." });
    const codeInput = card.createEl("input", { cls: "lab-search-input", attr: { placeholder: "비워 두면 코드를 만들어요" } });
    const make = card.createEl("button", { cls: "lab-btn is-primary", text: "초대 링크 만들기" });
    const result = card.createDiv({ cls: "lab-note" });
    make.addEventListener("click", () => {
      void this.plugin.createInvite(codeInput.value).then((invite) => {
        codeInput.value = "";
        result.empty();
        result.createEl("p", { text: `팀코드 ${invite.code}` });
        result.createEl("p", { text: invite.obsidian });
        if (invite.web) result.createEl("p", { text: invite.web });
        const copy = result.createEl("button", { cls: "lab-btn", text: "초대 링크 복사" });
        copy.addEventListener("click", () => {
          void navigator.clipboard.writeText(invite.web || invite.obsidian);
          new Notice("초대 링크를 복사했어요.");
        });
      }).catch((error: unknown) => {
        new Notice(error instanceof Error ? error.message : "초대 링크를 만들지 못했어요.");
      });
    });
    const deploy = card.createEl("button", { cls: "lab-btn", text: "브리핑 배포용 값 복사" });
    deploy.addEventListener("click", () => {
      void navigator.clipboard.writeText(this.plugin.deployConfig());
      new Notice("배포용 값을 복사했어요. Vercel의 NEXT_PUBLIC_LABSIDIAN_CONFIG에 붙여 넣어요.");
    });
    if (!this.plugin.settings.teamId) return;
    const members = card.createDiv();
    const refresh = card.createEl("button", { cls: "lab-btn", text: "멤버 새로고침" });
    const paint = async () => {
      members.empty();
      const people = await this.plugin.listTeamMembers();
      if (!people.length) {
        members.createEl("p", { cls: "lab-note", text: "아직 다른 멤버가 없어요." });
        return;
      }
      for (const person of people) {
        const row = members.createDiv({ cls: "lab-row" });
        row.createSpan({ text: person.displayName || person.uid });
        const remove = row.createEl("button", { cls: "lab-btn", text: "멤버 빼기" });
        remove.addEventListener("click", () => {
          void this.plugin.removeTeamMember(person.uid).then(() => paint());
        });
      }
    };
    refresh.addEventListener("click", () => void paint());
    void paint();
  }

  private about(root: HTMLElement): void {
    const group = this.group(root, t("settings.about"));
    group.createEl("p", { cls: "lab-note", text: t("settings.aboutBody") });
    group.createEl("p", { cls: "lab-note", text: "kordoc 4.24.80. 브리핑은 로그인 없이 누구나 볼 수 있어요." });
  }

  private group(root: HTMLElement, heading: string): HTMLElement {
    const made = createSettingGroup(root);
    if (made) {
      made.setHeading(heading);
      return made.listEl;
    }
    new Setting(root).setName(heading).setHeading();
    return root;
  }
}

function short(id: SourceId): string {
  switch (id) {
    case "kofic":
      return "영";
    case "kocca":
      return "콘";
    case "openalex":
      return "OA";
    case "kci":
      return "K";
    case "riss":
      return "R";
    default: {
      const exhaustive: never = id;
      return exhaustive;
    }
  }
}
