import * as obsidian from "obsidian";
import type { Setting } from "obsidian";

declare module "obsidian" {
  interface App {
    secretStorage?: {
      setSecret(id: string, secret: string): void;
      getSecret(id: string): string | null;
      listSecrets(): string[];
    };
  }
}

export interface SettingGroupLike {
  listEl: HTMLElement;
  setHeading(text: string | DocumentFragment): SettingGroupLike;
  addClass(...classes: string[]): SettingGroupLike;
  addSetting(cb: (setting: Setting) => void): SettingGroupLike;
}

interface ObsidianUi {
  SettingGroup?: new (containerEl: HTMLElement) => SettingGroupLike;
}

const ui = obsidian as unknown as ObsidianUi;

export function createSettingGroup(container: HTMLElement): SettingGroupLike | null {
  if (!ui.SettingGroup) return null;
  return new ui.SettingGroup(container);
}
