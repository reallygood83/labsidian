import { Modal, type App } from "obsidian";
import type { PublicFirebaseConfig } from "../../packages/shared/team";

export class InviteConfirmModal extends Modal {
  constructor(
    app: App,
    private readonly config: PublicFirebaseConfig,
    private readonly currentProjectId: string,
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
    const current = this.currentProjectId.trim();
    const next = this.config.projectId;
    shell.createEl("p", { text: `지금 연결 ${current || "없음"}` });
    shell.createEl("p", { text: `새로 연결 ${next}` });
    if (current && current !== next) {
      shell.createEl("p", { cls: "lab-note", text: `지금 연결된 프로젝트(${current})와 다른 프로젝트(${next})예요. 연결하면 이 볼트의 클라우드 설정이 바뀌어요.` });
    }
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
