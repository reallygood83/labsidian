import { setIcon } from "obsidian";

export function iconLabel(parent: HTMLElement, icon: string, text: string, cls = "lab-icontext"): HTMLElement {
  const row = parent.createDiv({ cls });
  const glyph = row.createSpan({ cls: "lab-glyph", attr: { "aria-hidden": "true" } });
  setIcon(glyph, icon);
  row.createSpan({ text });
  return row;
}

export function spinner(parent: HTMLElement): HTMLElement {
  const node = parent.createSpan({ cls: "lab-spinner", attr: { role: "status" } });
  node.setAttr("aria-label", "불러오는 중");
  return node;
}
