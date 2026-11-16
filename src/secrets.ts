export const SECRET = {
  gemini: "labsidian-ai-gemini",
  openai: "labsidian-ai-openai",
  anthropic: "labsidian-ai-anthropic",
  kci: "labsidian-source-kci",
  riss: "labsidian-source-riss",
  openalex: "labsidian-source-openalex",
  firebaseRefresh: "labsidian-firebase-refresh",
  teamCode: "labsidian-team-code",
} as const;

export type SecretId = (typeof SECRET)[keyof typeof SECRET];

export interface SecretStore {
  available: boolean;
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
  has(key: string): boolean;
}

interface StorageLike {
  getSecret?: (id: string) => string | null;
  setSecret?: (id: string, secret: string) => void;
  listSecrets?: () => string[];
  get?: (key: string) => Promise<string | null | undefined>;
  set?: (key: string, secret: string) => Promise<void>;
}

const UNAVAILABLE = "이 옵시디언에는 키체인(SecretStorage)이 없어요. 1.11.4 이상에서 키를 저장할 수 있어요.";

export function createUnavailableSecrets(): SecretStore {
  return {
    available: false,
    async get() {
      return null;
    },
    async set() {
      throw new Error(UNAVAILABLE);
    },
    async remove() {
      throw new Error(UNAVAILABLE);
    },
    has() {
      return false;
    },
  };
}

export function createSecretStore(app: { secretStorage?: unknown }): SecretStore {
  const storage = app.secretStorage as StorageLike | undefined;
  const modern = storage && typeof storage.getSecret === "function" && typeof storage.setSecret === "function";
  if (!modern || !storage) return createUnavailableSecrets();

  return {
    available: true,
    async get(key) {
      const value = storage.getSecret?.(key) ?? null;
      return value && value.length > 0 ? value : null;
    },
    async set(key, value) {
      storage.setSecret?.(key, value);
    },
    async remove(key) {
      storage.setSecret?.(key, "");
    },
    has(key) {
      const listed = storage.listSecrets?.() ?? [];
      if (listed.includes(key)) {
        const value = storage.getSecret?.(key) ?? "";
        return value.length > 0;
      }
      return false;
    },
  };
}
