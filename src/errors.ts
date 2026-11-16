export class LabsidianError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LabsidianError";
  }
}

export function errorText(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "알 수 없는 오류가 났습니다.";
}
