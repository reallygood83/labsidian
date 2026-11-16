import type { HttpClient } from "./http/types";
import type { SecretStore } from "./secrets";
import type { LabsidianSettings } from "./settings";
import type { SourceId } from "./sources/types";

export interface LabsidianHost {
  settings: LabsidianSettings;
  secrets: SecretStore;
  http: HttpClient;
  saveSettings(): Promise<void>;
  testSource(id: SourceId): Promise<string>;
  login(password: string): Promise<string>;
  createInvite(code: string): Promise<{ obsidian: string; web: string; code: string }>;
  deployConfig(): string;
  listTeamMembers(): Promise<{ uid: string; email: string }[]>;
  removeTeamMember(uid: string): Promise<void>;
  joinTeam(email: string, password: string, mode: "signup" | "login"): Promise<string>;
}
