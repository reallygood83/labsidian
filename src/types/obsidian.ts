import * as obsidian from "obsidian";
import type { BaseComponent, Setting } from "obsidian";

declare module "obsidian" {
  interface App {
    secretStorage?: {
      setSecret(id: string, secret: string): void;
      getSecret(id: string): string | null;
      listSecrets(): string[];
    };
  }
}

export interface SecretComponentLike extends BaseComponent {
  setValue(value: string): SecretComponentLike;
  onChange(cb: (value: string | null) => unknown): SecretComponentLike;
}

export interface SettingGroupLike {
  listEl: HTMLElement;
  setHeading(text: string | DocumentFragment): SettingGroupLike;
  addClass(...classes: string[]): SettingGroupLike;
  addSetting(cb: (setting: Setting) => void): SettingGroupLike;
}

interface ObsidianUi {
  SecretComponent?: new (app: obsidian.App, containerEl: HTMLElement) => SecretComponentLike;
  SettingGroup?: new (containerEl: HTMLElement) => SettingGroupLike;
}

const ui = obsidian as unknown as ObsidianUi;

export function createSettingGroup(container: HTMLElement): SettingGroupLike | null {
  if (!ui.SettingGroup) return null;
  return new ui.SettingGroup(container);
}

export function createSecretField(app: obsidian.App, container: HTMLElement): SecretComponentLike | null {
  if (!ui.SecretComponent) return null;
  return new ui.SecretComponent(app, container);
}
