import ko from "../i18n/ko.json";

export function t(path: string, vars?: Record<string, string | number>): string {
  const value = path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, ko);
  if (typeof value !== "string") return path;
  return value.replace(/\{(\w+)\}/g, (_, name: string) => String(vars?.[name] ?? ""));
}

export function formatDotDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (!match) return iso;
  return `${match[1]}.${match[2]}.${match[3]}`;
}

export function formatPages(count: number): string {
  return `${count}쪽`;
}
