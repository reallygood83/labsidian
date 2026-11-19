import { describe, expect, it } from "vitest";
import { createSecretStore, resolveSecret } from "../src/secrets";

describe("keychain keys", () => {
  it("follows the keychain entry the picker chose", () => {
    const vault: Record<string, string> = { "labsidian-source-openalex": "openalex", openalex: "Real-Key_123" };
    const store = createSecretStore({
      secretStorage: {
        getSecret: (id: string) => vault[id] ?? null,
        setSecret: (id: string, value: string) => {
          vault[id] = value;
        },
        listSecrets: () => Object.keys(vault),
      },
    });
    return store.get("labsidian-source-openalex").then((value) => {
      expect(value).toBe("Real-Key_123");
      expect(store.reference("labsidian-source-openalex")).toBe("openalex");
    });
  });
  it("uses a stored value as is when it is not a keychain name", () => {
    expect(resolveSecret(" abc123 ", () => null, "self")).toBe("abc123");
    expect(resolveSecret("Some-Raw.Key", () => "x", "self")).toBe("Some-Raw.Key");
    expect(resolveSecret(null, () => "x", "self")).toBeNull();
  });
});
