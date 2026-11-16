import { Modal, Notice, type App } from "obsidian";

export class JoinModal extends Modal {
  constructor(
    app: App,
    private readonly join: (email: string, password: string, displayName: string, mode: "signup" | "login") => Promise<{ status: "verify" | "joined"; message: string }>,
    private readonly resend: () => Promise<string>,
  ) {
    super(app);
  }

  onOpen(): void {
    this.modalEl.addClass("labsidian");
    this.modalEl.addClass("lab-modal-upload");
    const shell = this.contentEl.createDiv({ cls: "lab-upload" });
    shell.createEl("h3", { text: "팀에 들어가기" });
    shell.createEl("p", { cls: "lab-note", text: "메일, 비밀번호, 친구에게 보일 이름을 입력해요. 이름은 1자에서 80자이고, 메일 주소는 쓰지 않아요." });
    const emailRow = shell.createDiv({ cls: "lab-row" });
    emailRow.createSpan({ text: "이메일" });
    const email = emailRow.createEl("input", { cls: "lab-search-input", attr: { type: "email" } });
    const nameRow = shell.createDiv({ cls: "lab-row" });
    nameRow.createSpan({ text: "표시 이름" });
    const displayName = nameRow.createEl("input", { cls: "lab-search-input", attr: { placeholder: "예: 김연구" } });
    email.addEventListener("input", () => {
      if (displayName.value.trim()) return;
      displayName.placeholder = email.value.split("@")[0] || "예: 김연구";
    });
    const passwordRow = shell.createDiv({ cls: "lab-row" });
    passwordRow.createSpan({ text: "비밀번호" });
    const password = passwordRow.createEl("input", { cls: "lab-search-input", attr: { type: "password" } });
    const error = shell.createDiv({ cls: "lab-note" });
    const footer = shell.createDiv({ cls: "lab-footer" });
    const login = footer.createEl("button", { cls: "lab-btn", text: "로그인" });
    const signup = footer.createEl("button", { cls: "lab-btn is-primary", text: "가입하기" });
    const resend = footer.createEl("button", { cls: "lab-btn", text: "인증 메일 다시 보내기" });
    resend.hide();
    resend.addEventListener("click", () => {
      void this.resend().then((message) => error.setText(message)).catch((caught: unknown) => {
        error.setText(caught instanceof Error ? caught.message : "인증 메일을 다시 보내지 못했어요.");
      });
    });
    const submit = async (mode: "signup" | "login") => {
      error.setText("");
      if (!email.value.trim() || !password.value) {
        error.setText("메일과 비밀번호를 입력해 주세요.");
        return;
      }
      try {
        const named = displayName.value.trim() || email.value.split("@")[0] || "팀원";
        const result = await this.join(email.value.trim(), password.value, named, mode);
        password.value = "";
        if (result.status === "verify") {
          resend.show();
          error.setText(result.message);
          return;
        }
        new Notice(result.message);
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
