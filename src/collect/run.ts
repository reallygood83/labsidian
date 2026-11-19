import { summaryPrompt, summarize } from "../ai/summarize";
import { errorText } from "../errors";
import { pdfToMarkdown, type ConvertedImage } from "../pdf/convert";
import { looksLikePdf, localIsoDate } from "../text";
import { makeNote } from "./make";
import type { CollectSession } from "./session";
import type { LabsidianSettings } from "../settings";
import { sourceById } from "../sources/registry";
import type { Attachment, SearchHit, SourceContext } from "../sources/types";
import type { ResearchNote } from "../../packages/types/research-note";

const MAX_PDF = 40 * 1024 * 1024;
const MAX_IMAGES = 80;
const MAX_IMAGE_BYTES = 40 * 1024 * 1024;

export interface CollectDeps {
  ctx: SourceContext;
  settings: LabsidianSettings;
  choose: (files: Attachment[]) => Promise<Attachment | null>;
  write: (folder: string, filename: string, markdown: string, images: ConvertedImage[]) => Promise<string>;
  summaryKey: string | null;
  summaryUsed: number;
}

export async function runJob(session: CollectSession, hit: SearchHit, query: string, summarizeWanted: boolean, deps: CollectDeps): Promise<ResearchNote | null> {
  const id = hit.sourceId;
  if (session.isCancelled(id)) return null;
  try {
    session.patch(id, { stage: "receive", error: "" });
    const source = sourceById(hit.source);
    const loaded = await source.load(hit, deps.ctx);
    if (session.isCancelled(id)) return null;
    let body = "";
    let pdfUrl = "";
    let warnings: string[] = [];
    let converter = "";
    let images: ConvertedImage[] = [];
    const files = loaded.attachments;
    if (files.length) {
      const chosen = files.length === 1 ? files[0] : await deps.choose(files);
      if (chosen?.ref.url) pdfUrl = chosen.ref.url;
      if (chosen) {
        // A failed PDF step must not lose the note: keep the abstract, details and links.
        try {
          const bytes = await source.download(chosen, deps.ctx, loaded.hit.url);
          if (bytes.byteLength > MAX_PDF) throw new Error("PDF가 40MB보다 커서 받지 않았어요.");
          if (looksLikePdf(bytes)) {
            session.patch(id, { stage: "convert" });
            const converted = await pdfToMarkdown(bytes, { title: loaded.hit.title, images: deps.settings.saveImages }, (page, pages) => {
              session.patch(id, { page, pages });
            });
            body = converted.markdown;
            warnings = converted.warnings;
            converter = converted.converter;
            const kept = keepImages(converted.images);
            images = kept.images;
            body = dropMissingImages(body, new Set(images.map((image) => image.filename)));
            if (kept.dropped) warnings = [...warnings, `그림이 많아서 ${kept.dropped}개는 저장하지 않았어요.`];
            if (images.length) warnings = [...warnings, `그림 ${images.length}개를 저장했어요.`];
          } else {
            warnings = ["받은 파일이 PDF가 아니에요. 본문은 넣지 않았어요."];
          }
        } catch (error) {
          if (session.isCancelled(id)) return null;
          warnings = [`PDF 본문을 넣지 못했어요: ${errorText(error)} 초록과 원문 링크만 저장했어요.`];
        }
      }
    }
    let summary = "";
    let summaryModel = "";
    if (summarizeWanted && deps.summaryKey && deps.settings.aiEnabled && !session.isCancelled(id)) {
      if (deps.summaryUsed >= deps.settings.dailySummaryLimit) {
        warnings = [...warnings, "오늘 요약 상한에 도달해서 요약을 건너뛰었어요."];
      } else {
        session.patch(id, { stage: "summarize" });
        const excerpt = deps.settings.sendFullText ? body : body.slice(0, deps.settings.excerptChars);
        summary = await summarize(
          deps.ctx.http,
          deps.settings.aiProvider,
          deps.settings.aiModels[deps.settings.aiProvider],
          deps.summaryKey,
          summaryPrompt({ title: loaded.hit.title, source: loaded.hit.publisher, abstract: loaded.abstract, toc: loaded.toc, body: excerpt }),
        );
        summaryModel = deps.settings.aiModels[deps.settings.aiProvider];
      }
    }
    if (session.isCancelled(id)) return null;
    session.patch(id, { stage: "save" });
    const made = makeNote({
      hit: loaded.hit,
      query,
      settings: deps.settings,
      collectedAt: new Date(),
      body,
      pdfUrl,
      warnings,
      summary,
      summaryModel,
      converter,
      toc: loaded.toc,
    });
    const path = await deps.write(made.folder, made.filename, made.markdown, images);
    session.patch(id, { stage: "done", path });
    return { ...made.note, team_shared: false, uploaded_at: new Date().toISOString() };
  } catch (error) {
    if (!session.isCancelled(id)) session.patch(id, { stage: "error", error: errorText(error) });
    return null;
  }
}

export function collectedToday(settings: LabsidianSettings, now = new Date()): number {
  return settings.summaryCountDate === localIsoDate(now) ? settings.summaryCount : 0;
}

function keepImages(all: ConvertedImage[]): { images: ConvertedImage[]; dropped: number } {
  const images: ConvertedImage[] = [];
  let total = 0;
  for (const image of all) {
    if (images.length >= MAX_IMAGES || total + image.data.byteLength > MAX_IMAGE_BYTES) break;
    images.push(image);
    total += image.data.byteLength;
  }
  return { images, dropped: all.length - images.length };
}

/** Remove placeholders for pictures that will not be written, so no broken embeds remain. */
export function dropMissingImages(markdown: string, kept: ReadonlySet<string>): string {
  return markdown.replace(/!\[[^\]]*\]\(([^)]+)\)\n?/g, (full, dest: string) => {
    if (/^https?:\/\//i.test(dest.trim())) return full;
    return kept.has(dest.trim()) ? full : "";
  });
}
