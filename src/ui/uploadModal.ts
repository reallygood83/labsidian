import { Modal, type App } from "obsidian";
import { t } from "../i18n";

export interface UploadItem {
  title: string;
  sourceId: string;
  updating: boolean;
}

export interface UploadPlan {
  hideTitle: boolean;
  passwords: Record<string, string>;
}

export class UploadModal extends Modal {
  constructor(
    app: App,
    private readonly items: UploadItem[],
    private readonly onConfirm: (plan: UploadPlan) => void,
  ) {
    super(app);
  }

  onOpen(): void {
    this.modalEl.addClass("labsidian");
    this.modalEl.addClass("lab-modal-upload");
    const shell = this.contentEl.createDiv({ cls: "lab-upload" });
    shell.createEl("h3", { text: t("upload.title", { count: this.items.length }) });
    const box = shell.createDiv({ cls: "lab-card" });
    box.createEl("p", { text: t("upload.body") });
    for (const item of this.items) {
      const row = box.createDiv({ cls: "lab-row" });
      row.createSpan({ text: item.title });
      row.createSpan({ cls: "lab-badge", text: item.updating ? t("upload.update") : t("upload.new") });
    }

    const lockRow = shell.createEl("label", { cls: "lab-check" });
    const lockToggle = lockRow.createEl("input", { attr: { type: "checkbox" } });
    lockRow.createSpan({ text: "비밀번호로 잠그기" });
    const lockBox = shell.createDiv({ cls: "lab-card" });
    lockBox.hide();
    lockBox.createEl("p", { cls: "lab-note", text: "비밀번호를 잊으면 아무도 열 수 없어요." });
    const shared = this.passwordPair(lockBox, "비밀번호", "비밀번호 확인");
    const perNote = lockBox.createEl("label", { cls: "lab-check" });
    const perToggle = perNote.createEl("input", { attr: { type: "checkbox" } });
    perNote.createSpan({ text: "노트마다 다른 비밀번호" });
    const perHost = lockBox.createDiv();
    const pairs = new Map<string, { password: HTMLInputElement; confirm: HTMLInputElement }>();
    for (const item of this.items) {
      const block = perHost.createDiv();
      block.createEl("p", { cls: "lab-note", text: item.title });
      pairs.set(item.sourceId, this.passwordPair(block, `${item.title} 비밀번호`, `${item.title} 확인`));
    }
    perHost.hide();
    const hideRow = lockBox.createEl("label", { cls: "lab-check" });
    const hideTitle = hideRow.createEl("input", { attr: { type: "checkbox" } });
    hideTitle.checked = true;
    hideRow.createSpan({ text: "제목도 숨기기" });
    lockBox.createEl("p", { cls: "lab-note", text: "잠그면 제목과 기관은 기본적으로 숨겨요. 체크를 끄면 제목만 공개돼요." });

    lockToggle.addEventListener("change", () => {
      if (lockToggle.checked) {
        hideTitle.checked = true;
        lockBox.show();
      } else {
        lockBox.hide();
      }
    });
    perToggle.addEventListener("change", () => {
      if (perToggle.checked) {
        perHost.show();
        shared.password.parentElement?.hide();
        shared.confirm.parentElement?.hide();
      } else {
        perHost.hide();
        shared.password.parentElement?.show();
        shared.confirm.parentElement?.show();
      }
    });

    const error = shell.createDiv({ cls: "lab-note" });
    const footer = shell.createDiv({ cls: "lab-footer" });
    const cancel = footer.createEl("button", { cls: "lab-btn", text: t("upload.cancel") });
    cancel.addEventListener("click", () => this.close());
    const confirm = footer.createEl("button", { cls: "lab-btn is-primary", text: t("upload.confirm") });
    confirm.addEventListener("click", () => {
      const passwords: Record<string, string> = {};
      if (lockToggle.checked) {
        if (perToggle.checked) {
          for (const item of this.items) {
            const pair = pairs.get(item.sourceId);
            const message = this.mismatch(pair?.password.value ?? "", pair?.confirm.value ?? "");
            if (message) {
              error.setText(message);
              return;
            }
            passwords[item.sourceId] = pair?.password.value ?? "";
          }
        } else {
          const message = this.mismatch(shared.password.value, shared.confirm.value);
          if (message) {
            error.setText(message);
            return;
          }
          for (const item of this.items) passwords[item.sourceId] = shared.password.value;
        }
      }
      const plan = { hideTitle: hideTitle.checked, passwords };
      shared.password.value = "";
      shared.confirm.value = "";
      for (const pair of pairs.values()) {
        pair.password.value = "";
        pair.confirm.value = "";
      }
      this.close();
      this.onConfirm(plan);
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private passwordPair(parent: HTMLElement, passwordLabel: string, confirmLabel: string): { password: HTMLInputElement; confirm: HTMLInputElement } {
    const passwordWrap = parent.createDiv({ cls: "lab-row" });
    passwordWrap.createSpan({ text: passwordLabel });
    const password = passwordWrap.createEl("input", { cls: "lab-search-input", attr: { type: "password" } });
    const confirmWrap = parent.createDiv({ cls: "lab-row" });
    confirmWrap.createSpan({ text: confirmLabel });
    const confirm = confirmWrap.createEl("input", { cls: "lab-search-input", attr: { type: "password" } });
    return { password, confirm };
  }

  private mismatch(password: string, confirm: string): string {
    if (!password) return "비밀번호를 입력해 주세요.";
    if (password !== confirm) return "비밀번호 확인이 같지 않아요.";
    return "";
  }
}
