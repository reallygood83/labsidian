import { errorText } from "../errors";
import { t } from "../i18n";
import type { SearchGroup, SourceContext, SourceId, SourceModule } from "./types";

const FAIL: Record<SourceId, string> = {
  kofic: "fail.kofic",
  kocca: "fail.kocca",
  openalex: "fail.openalex",
  kci: "fail.kci",
  riss: "fail.riss",
};

export async function searchSources(
  sources: readonly SourceModule[],
  query: string,
  ctx: SourceContext,
  onGroup: (group: SearchGroup) => void,
): Promise<void> {
  await Promise.all(
    sources.map(async (source) => {
      try {
        const hits = await source.search(query, ctx);
        onGroup({ source: source.id, label: source.label, hits });
      } catch (error) {
        const reason = errorText(error) || t("fail.network");
        onGroup({
          source: source.id,
          label: source.label,
          hits: [],
          error: t(FAIL[source.id], { reason }),
        });
      }
    }),
  );
}
