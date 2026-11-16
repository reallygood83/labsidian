import { parsePdf, VERSION } from "kordoc";
import { LabsidianError } from "../errors";
import { cleanConvertedMarkdown } from "./cleanup";

export interface ConvertResult {
  markdown: string;
  warnings: string[];
  pageCount?: number;
  converter: string;
}

export async function pdfToMarkdown(
  bytes: Uint8Array,
  hint: { title?: string },
  onPage?: (page: number, pages: number) => void,
): Promise<ConvertResult> {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const result = await parsePdf(buffer, {
    ocr: false,
    images: false,
    removeHeaderFooter: true,
    formulaOcr: false,
    qrCodes: false,
    onProgress: onPage,
  });
  if (!result.success) throw new LabsidianError(result.error || "PDF를 마크다운으로 바꾸지 못했어요.");
  const cleaned = cleanConvertedMarkdown(result.markdown, hint);
  const warnings = [
    ...cleaned.warnings,
    ...(result.warnings ?? []).slice(0, 8).map((warning) => warning.message),
  ];
  if (result.pageCount) warnings.unshift(`${result.pageCount}쪽을 변환했어요.`);
  return {
    markdown: cleaned.markdown,
    warnings,
    pageCount: result.pageCount,
    converter: `kordoc ${VERSION}`,
  };
}
