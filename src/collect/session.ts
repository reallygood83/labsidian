import type { SourceId } from "../sources/types";

export type Stage = "wait" | "receive" | "convert" | "summarize" | "save" | "done" | "error" | "cancelled";

export interface JobView {
  id: string;
  title: string;
  url: string;
  source: SourceId;
  hasPdf: boolean;
  stage: Stage;
  page?: number;
  pages?: number;
  error?: string;
  path?: string;
}

export class CollectSession {
  jobs: JobView[];
  private readonly listeners = new Set<() => void>();
  private readonly cancelled = new Set<string>();

  constructor(jobs: JobView[]) {
    this.jobs = jobs;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  patch(id: string, partial: Partial<JobView>): void {
    this.jobs = this.jobs.map((job) => (job.id === id ? { ...job, ...partial } : job));
    for (const listener of this.listeners) listener();
  }

  cancel(id: string): void {
    this.cancelled.add(id);
    this.patch(id, { stage: "cancelled" });
  }

  isCancelled(id: string): boolean {
    return this.cancelled.has(id);
  }

  get doneCount(): number {
    return this.jobs.filter((job) => job.stage === "done" || job.stage === "error" || job.stage === "cancelled").length;
  }

  get finished(): boolean {
    return this.doneCount === this.jobs.length;
  }
}
