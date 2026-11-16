import { kciSource } from "./kci";
import { koccaSource } from "./kocca";
import { koficSource } from "./kofic";
import { openalexSource } from "./openalex";
import { rissSource } from "./riss";
import type { LabsidianSettings } from "../settings";
import type { SourceId, SourceModule } from "./types";

export const SOURCES: readonly SourceModule[] = [koficSource, koccaSource, openalexSource, kciSource, rissSource];

/** KCI와 RISS는 키가 없으면 검색하지 않습니다. 다른 출처는 그대로 돕니다. */
export function runnableSources(settings: LabsidianSettings, keys: Partial<Record<SourceId, string>>): SourceModule[] {
  return SOURCES.filter((source) => {
    if (!settings.sources[source.id]) return false;
    if (source.requiresKey && !keys[source.id]) return false;
    return true;
  });
}

export function sourceById(id: SourceId): SourceModule {
  switch (id) {
    case "kofic":
      return koficSource;
    case "kocca":
      return koccaSource;
    case "openalex":
      return openalexSource;
    case "kci":
      return kciSource;
    case "riss":
      return rissSource;
    default: {
      const exhaustive: never = id;
      return exhaustive;
    }
  }
}
