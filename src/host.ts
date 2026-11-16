import type { TeamMember } from "./team/membership";
import type { HttpClient } from "./http/types";
import type { SecretStore } from "./secrets";
import type { LabsidianSettings } from "./settings";
import type { SourceId } from "./sources/types";

export interface LabsidianHost {
  settings: LabsidianSettings;
  secrets: SecretStore;
  http: HttpClient;
  saveSettings(): Promise<void>;
  openTour(): void;
  rulesForMe(): Promise<string>;
  testSource(id: SourceId): Promise<string>;
  login(password: string): Promise<string>;
  signUpEmail(password: string): Promise<string>;
  loginWithGoogle(idToken: string): Promise<string>;
  resendVerificationEmail(): Promise<string>;
  createInvite(code: string): Promise<{ obsidian: string; web: string; code: string }>;
  deployConfig(): string;
  listTeamMembers(): Promise<TeamMember[]>;
  connectPersonalLibrary(): Promise<string>;
  movePersonalNotesToTeam(): Promise<string>;
  removeTeamMember(uid: string): Promise<string>;
  joinTeam(email: string, password: string, displayName: string, mode: "signup" | "login"): Promise<{ status: "verify" | "joined"; message: string }>;
}
