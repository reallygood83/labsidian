import { Modal, type App } from "obsidian";
import { TOUR_STEPS } from "../collect/usability";

export class TourModal extends Modal {
  private step = 0;

  constructor(app: App, private readonly onDone: () => void) {
    super(app);
  }

  onOpen(): void {
    this.modalEl.addClass("labsidian");
    this.paint();
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private paint(): void {
    const root = this.contentEl;
    root.empty();
    root.addClass("labsidian");
    const shell = root.createDiv({ cls: "lab-upload" });
    const current = TOUR_STEPS[this.step] ?? TOUR_STEPS[0];
    shell.createEl("p", { cls: "lab-note", text: `${this.step + 1}/${TOUR_STEPS.length}` });
    shell.createEl("h3", { text: current.title });
    shell.createEl("p", { text: current.body });
    const footer = shell.createDiv({ cls: "lab-footer" });
    const skip = footer.createEl("button", { cls: "lab-btn", text: "건너뛰기" });
    skip.addEventListener("click", () => {
      this.onDone();
      this.close();
    });
    const next = footer.createEl("button", { cls: "lab-btn is-primary", text: this.step === TOUR_STEPS.length - 1 ? "시작하기" : "다음" });
    next.addEventListener("click", () => {
      if (this.step === TOUR_STEPS.length - 1) {
        this.onDone();
        this.close();
        return;
      }
      this.step += 1;
      this.paint();
    });
  }
}
