import type { SourceId } from "./sources/types";

export type AiProvider = "gemini" | "openai" | "anthropic";

export interface FieldToggles {
  series: boolean;
  type: boolean;
  publisher: boolean;
  author: boolean;
  published: boolean;
  pdfUrl: boolean;
  query: boolean;
  keywords: boolean;
  converter: boolean;
  convertWarnings: boolean;
  summaryModel: boolean;
  teamShared: boolean;
  tags: boolean;
}

export interface LabsidianSettings {
  noteFolder: string;
  filenameTemplate: string;
  extraTags: string;
  fields: FieldToggles;
  sources: Record<SourceId, boolean>;
  openalexMailto: string;
  aiEnabled: boolean;
  aiProvider: AiProvider;
  aiModels: Record<AiProvider, string>;
  sendFullText: boolean;
  excerptChars: number;
  dailySummaryLimit: number;
  summaryCountDate: string;
  summaryCount: number;
  libraryMode: "solo" | "personal" | "team";
  shareOnBriefing: boolean;
  firebaseEnabled: boolean;
  firebaseProjectId: string;
  firebaseApiKey: string;
  firebaseEmail: string;
  displayName: string;
  teamId: string;
  moveTeamId: string;
  teamName: string;
  codeSalt: string;
  briefingUrl: string;
  recentQueries: string[];
  lastSyncAt: string;
  lastSyncCount: number;
  tourSeen: boolean;
}

const FIELDS: FieldToggles = {
  series: true,
  type: true,
  publisher: true,
  author: true,
  published: true,
  pdfUrl: true,
  query: true,
  keywords: true,
  converter: true,
  convertWarnings: true,
  summaryModel: true,
  teamShared: true,
  tags: true,
};

export const DEFAULT_SETTINGS: LabsidianSettings = {
  noteFolder: "연구자료",
  filenameTemplate: "{{series}} {{title}}",
  extraTags: "",
  fields: FIELDS,
  sources: { kofic: true, kocca: true, openalex: true, kci: false, riss: false },
  openalexMailto: "",
  aiEnabled: false,
  aiProvider: "gemini",
  aiModels: {
    gemini: "gemini-2.5-flash",
    openai: "gpt-4.1-mini",
    anthropic: "claude-haiku-4-5",
  },
  sendFullText: false,
  excerptChars: 6000,
  dailySummaryLimit: 20,
  summaryCountDate: "",
  summaryCount: 0,
  libraryMode: "solo",
  shareOnBriefing: false,
  firebaseEnabled: false,
  firebaseProjectId: "",
  firebaseApiKey: "",
  firebaseEmail: "",
  displayName: "",
  teamId: "",
  moveTeamId: "",
  teamName: "",
  codeSalt: "",
  briefingUrl: "",
  recentQueries: [],
  lastSyncAt: "",
  lastSyncCount: 0,
  tourSeen: false,
};

const FORBIDDEN = ["password", "refreshToken", "idToken", "kciKey", "rissKey", "geminiKey", "openaiKey", "serviceAccount"];

export function mergeSettings(raw: unknown): LabsidianSettings {
  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const sources = asRecord(record.sources);
  const fields = asRecord(record.fields);
  const models = asRecord(record.aiModels);
  const provider = record.aiProvider;
  const aiProvider: AiProvider =
    provider === "openai" || provider === "anthropic" || provider === "gemini" ? provider : "gemini";
  return {
    ...DEFAULT_SETTINGS,
    noteFolder: str(record.noteFolder, DEFAULT_SETTINGS.noteFolder),
    filenameTemplate: str(record.filenameTemplate, DEFAULT_SETTINGS.filenameTemplate),
    extraTags: str(record.extraTags, ""),
    openalexMailto: str(record.openalexMailto, ""),
    aiEnabled: record.aiEnabled === true,
    aiProvider,
    sendFullText: record.sendFullText === true,
    excerptChars: int(record.excerptChars, 6000, 500, 80000),
    dailySummaryLimit: int(record.dailySummaryLimit, 20, 0, 500),
    summaryCountDate: str(record.summaryCountDate, ""),
    summaryCount: int(record.summaryCount, 0, 0, 100000),
    libraryMode: record.libraryMode === "personal" || record.libraryMode === "team" ? record.libraryMode : "solo",
    shareOnBriefing: record.shareOnBriefing === true,
    firebaseEnabled: record.firebaseEnabled === true,
    firebaseProjectId: str(record.firebaseProjectId, "").trim(),
    firebaseApiKey: str(record.firebaseApiKey, "").trim(),
    firebaseEmail: str(record.firebaseEmail, "").trim(),
    displayName: str(record.displayName, "").trim(),
    teamId: str(record.teamId, "").trim(),
    moveTeamId: str(record.moveTeamId, "").trim(),
    teamName: str(record.teamName, "").trim(),
    codeSalt: str(record.codeSalt, "").trim(),
    briefingUrl: str(record.briefingUrl, "").trim(),
    recentQueries: stringList(record.recentQueries).slice(0, 8),
    lastSyncAt: str(record.lastSyncAt, ""),
    lastSyncCount: int(record.lastSyncCount, 0, 0, 100000),
    tourSeen: record.tourSeen === true,
    sources: {
      kofic: sources.kofic !== false,
      kocca: sources.kocca !== false,
      openalex: sources.openalex !== false,
      kci: sources.kci === true,
      riss: sources.riss === true,
    },
    fields: {
      series: fields.series !== false,
      type: fields.type !== false,
      publisher: fields.publisher !== false,
      author: fields.author !== false,
      published: fields.published !== false,
      pdfUrl: fields.pdfUrl !== false,
      query: fields.query !== false,
      keywords: fields.keywords !== false,
      converter: fields.converter !== false,
      convertWarnings: fields.convertWarnings !== false,
      summaryModel: fields.summaryModel !== false,
      teamShared: fields.teamShared !== false,
      tags: fields.tags !== false,
    },
    aiModels: {
      gemini: str(models.gemini, DEFAULT_SETTINGS.aiModels.gemini),
      openai: str(models.openai, DEFAULT_SETTINGS.aiModels.openai),
      anthropic: str(models.anthropic, DEFAULT_SETTINGS.aiModels.anthropic),
    },
  };
}

export function settingsForDisk(settings: LabsidianSettings): LabsidianSettings {
  const copy = mergeSettings(settings);
  const record = copy as unknown as Record<string, unknown>;
  for (const key of FORBIDDEN) delete record[key];
  return copy;
}

export function rememberQuery(settings: LabsidianSettings, query: string): string[] {
  const next = [query, ...settings.recentQueries.filter((item) => item !== query)];
  return next.slice(0, 8);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function str(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function int(value: unknown, fallback: number, min: number, max: number): number {
  const number = typeof value === "number" ? value : Number.NaN;
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(number)));
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}
