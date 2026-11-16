import { Modal, type App } from "obsidian";

export interface PasswordAnswer {
  current: string;
  next: string | null;
  hideTitle: boolean;
}

/** Asks for a password and forgets the field values when the modal closes. */
export function askPassword(app: App, title: string): Promise<string | null> {
  return new Promise((resolve) => {
    const modal = new Modal(app);
    modal.onOpen = () => {
      modal.modalEl.addClass("labsidian");
      modal.modalEl.addClass("lab-modal-upload");
      const shell = modal.contentEl.createDiv({ cls: "lab-upload" });
      shell.createEl("h3", { text: title });
      shell.createEl("p", { cls: "lab-note", text: "비밀번호는 이 창에서만 쓰고, 저장하지 않아요." });
      const input = shell.createEl("input", { cls: "lab-search-input", attr: { type: "password" } });
      const error = shell.createDiv({ cls: "lab-note" });
      const row = shell.createDiv({ cls: "lab-footer" });
      const cancel = row.createEl("button", { cls: "lab-btn", text: "취소" });
      cancel.addEventListener("click", () => {
        input.value = "";
        modal.close();
        resolve(null);
      });
      const ok = row.createEl("button", { cls: "lab-btn is-primary", text: "열기" });
      ok.addEventListener("click", () => {
        const value = input.value;
        if (!value) {
          error.setText("비밀번호를 입력해 주세요.");
          return;
        }
        input.value = "";
        modal.close();
        resolve(value);
      });
    };
    modal.onClose = () => modal.contentEl.empty();
    modal.open();
  });
}

export function askPasswordChange(app: App): Promise<PasswordAnswer | null> {
  return new Promise((resolve) => {
    const modal = new Modal(app);
    modal.onOpen = () => {
      modal.modalEl.addClass("labsidian");
      modal.modalEl.addClass("lab-modal-upload");
      const shell = modal.contentEl.createDiv({ cls: "lab-upload" });
      shell.createEl("h3", { text: "잠금 비밀번호 바꾸기" });
      shell.createEl("p", { cls: "lab-note", text: "본인이 올린 문서만 바꿀 수 있어요. 지금 비밀번호가 있어야 하고, 잊으면 복구할 수 없어요." });
      const current = labeled(shell, "지금 비밀번호");
      const next = labeled(shell, "새 비밀번호");
      const confirm = labeled(shell, "새 비밀번호 확인");
      const hideRow = shell.createEl("label", { cls: "lab-check" });
      const hideTitle = hideRow.createEl("input", { attr: { type: "checkbox" } });
      hideRow.createSpan({ text: "제목도 숨기기" });
      const error = shell.createDiv({ cls: "lab-note" });
      const row = shell.createDiv({ cls: "lab-footer" });
      const cancel = row.createEl("button", { cls: "lab-btn", text: "취소" });
      cancel.addEventListener("click", () => close(null));
      const unlock = row.createEl("button", { cls: "lab-btn", text: "잠금 해제" });
      unlock.addEventListener("click", () => {
        if (!current.value) {
          error.setText("지금 비밀번호를 입력해 주세요.");
          return;
        }
        close({ current: current.value, next: null, hideTitle: false });
      });
      const change = row.createEl("button", { cls: "lab-btn is-primary", text: "비밀번호 바꾸기" });
      change.addEventListener("click", () => {
        if (!current.value || !next.value) {
          error.setText("비밀번호를 입력해 주세요.");
          return;
        }
        if (next.value !== confirm.value) {
          error.setText("새 비밀번호 확인이 같지 않아요.");
          return;
        }
        close({ current: current.value, next: next.value, hideTitle: hideTitle.checked });
      });

      function close(answer: PasswordAnswer | null): void {
        current.value = "";
        next.value = "";
        confirm.value = "";
        modal.close();
        resolve(answer);
      }
    };
    modal.onClose = () => modal.contentEl.empty();
    modal.open();
  });
}

function labeled(parent: HTMLElement, text: string): HTMLInputElement {
  const row = parent.createDiv({ cls: "lab-row" });
  row.createSpan({ text });
  return row.createEl("input", { cls: "lab-search-input", attr: { type: "password" } });
}
