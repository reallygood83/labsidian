import { parsePdf, VERSION } from "kordoc";
import { LabsidianError } from "../errors";
import { cleanConvertedMarkdown } from "./cleanup";

export interface ConvertedImage {
  filename: string;
  data: Uint8Array;
  mimeType: string;
}

export interface ConvertResult {
  markdown: string;
  images: ConvertedImage[];
  warnings: string[];
  pageCount?: number;
  converter: string;
}

export async function pdfToMarkdown(
  bytes: Uint8Array,
  hint: { title?: string; images?: boolean },
  onPage?: (page: number, pages: number) => void,
): Promise<ConvertResult> {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const result = await parsePdf(buffer, {
    ocr: false,
    images: hint.images === true,
    removeHeaderFooter: true,
    formulaOcr: false,
    qrCodes: false,
    onProgress: onPage,
  });
  if (!result.success) throw new LabsidianError(result.error || "PDF를 마크다운으로 바꾸지 못했어요.");
  const images = hint.images === true ? (result.images ?? []) : [];
  const cleaned = cleanConvertedMarkdown(result.markdown, { title: hint.title, keepImages: new Set(images.map((image) => image.filename)) });
  const warnings = [
    ...cleaned.warnings,
    ...(result.warnings ?? [])
      .map((warning) => warning.message)
      // With pictures saved, "image area has no text" is expected, not a loss.
      .filter((message) => !(images.length && message.includes("이미지 영역")))
      .slice(0, 8),
  ];
  if (result.pageCount) warnings.unshift(`${result.pageCount}쪽을 변환했어요.`);
  return {
    markdown: cleaned.markdown,
    images: images.map((image) => ({ filename: image.filename, data: image.data, mimeType: image.mimeType })),
    warnings,
    pageCount: result.pageCount,
    converter: `kordoc ${VERSION}`,
  };
}
