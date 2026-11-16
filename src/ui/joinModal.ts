import { Modal, Notice, type App } from "obsidian";

export class JoinModal extends Modal {
  constructor(
    app: App,
    private readonly join: (email: string, password: string, mode: "signup" | "login") => Promise<string>,
  ) {
    super(app);
  }

  onOpen(): void {
    this.modalEl.addClass("labsidian");
    this.modalEl.addClass("lab-modal-upload");
    const shell = this.contentEl.createDiv({ cls: "lab-upload" });
    shell.createEl("h3", { text: "팀에 들어가기" });
    shell.createEl("p", { cls: "lab-note", text: "메일과 비밀번호만 입력하면 돼요. 설정 파일은 건드리지 않아요." });
    const emailRow = shell.createDiv({ cls: "lab-row" });
    emailRow.createSpan({ text: "이메일" });
    const email = emailRow.createEl("input", { cls: "lab-search-input", attr: { type: "email" } });
    const passwordRow = shell.createDiv({ cls: "lab-row" });
    passwordRow.createSpan({ text: "비밀번호" });
    const password = passwordRow.createEl("input", { cls: "lab-search-input", attr: { type: "password" } });
    const error = shell.createDiv({ cls: "lab-note" });
    const footer = shell.createDiv({ cls: "lab-footer" });
    const login = footer.createEl("button", { cls: "lab-btn", text: "로그인" });
    const signup = footer.createEl("button", { cls: "lab-btn is-primary", text: "가입하기" });
    const submit = async (mode: "signup" | "login") => {
      error.setText("");
      if (!email.value.trim() || !password.value) {
        error.setText("메일과 비밀번호를 입력해 주세요.");
        return;
      }
      try {
        const message = await this.join(email.value.trim(), password.value, mode);
        password.value = "";
        new Notice(message);
        this.close();
      } catch (caught) {
        password.value = "";
        error.setText(caught instanceof Error ? caught.message : "가입하지 못했어요.");
      }
    };
    login.addEventListener("click", () => void submit("login"));
    signup.addEventListener("click", () => void submit("signup"));
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
