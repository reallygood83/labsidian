import { Modal, type App } from "obsidian";
import type { PublicFirebaseConfig } from "../../packages/shared/team";

export class InviteConfirmModal extends Modal {
  constructor(
    app: App,
    private readonly config: PublicFirebaseConfig,
    private readonly onConfirm: () => Promise<void>,
  ) {
    super(app);
  }

  onOpen(): void {
    this.modalEl.addClass("labsidian");
    this.modalEl.addClass("lab-modal-upload");
    const shell = this.contentEl.createDiv({ cls: "lab-upload" });
    const name = this.config.teamName || "팀";
    shell.createEl("h3", { text: `${name} 팀 서고에 연결할까요?` });
    shell.createEl("p", { text: `관리자 ${this.config.adminName || "관리자"}` });
    const details = shell.createEl("details");
    details.createEl("summary", { text: "자세히 보기" });
    details.createEl("p", { cls: "lab-note", text: `프로젝트 ${this.config.projectId}` });
    details.createEl("p", { cls: "lab-note", text: `팀 번호 ${this.config.teamId}` });
    const error = shell.createDiv({ cls: "lab-note" });
    const footer = shell.createDiv({ cls: "lab-footer" });
    const cancel = footer.createEl("button", { cls: "lab-btn", text: "취소" });
    cancel.addEventListener("click", () => this.close());
    const connect = footer.createEl("button", { cls: "lab-btn is-primary", text: "연결하기" });
    connect.addEventListener("click", () => {
      void this.onConfirm().then(() => this.close()).catch((caught: unknown) => {
        error.setText(caught instanceof Error ? caught.message : "연결하지 못했어요. 링크를 다시 열어 주세요.");
      });
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
