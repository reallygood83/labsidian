import { Modal, type App } from "obsidian";

export function askConfirm(app: App, title: string, body: string): Promise<boolean> {
  return new Promise((resolve) => {
    const modal = new ConfirmModal(app, title, body, resolve);
    modal.open();
  });
}

class ConfirmModal extends Modal {
  private answered = false;

  constructor(
    app: App,
    private readonly titleText: string,
    private readonly bodyText: string,
    private readonly done: (value: boolean) => void,
  ) {
    super(app);
  }

  onOpen(): void {
    this.modalEl.addClass("labsidian");
    const shell = this.contentEl.createDiv({ cls: "lab-upload" });
    shell.createEl("h3", { text: this.titleText });
    shell.createEl("p", { text: this.bodyText });
    const footer = shell.createDiv({ cls: "lab-footer" });
    const cancel = footer.createEl("button", { cls: "lab-btn", text: "취소" });
    cancel.addEventListener("click", () => {
      this.answered = true;
      this.done(false);
      this.close();
    });
    const ok = footer.createEl("button", { cls: "lab-btn is-primary", text: "확인" });
    ok.addEventListener("click", () => {
      this.answered = true;
      this.done(true);
      this.close();
    });
  }

  onClose(): void {
    if (!this.answered) this.done(false);
    this.contentEl.empty();
  }
}
