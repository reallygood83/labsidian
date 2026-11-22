// Shown on wide screens only: phones and tablets usually have no desktop Obsidian to open.
export function OpenInObsidian({ sourceId }: { sourceId: string }) {
  const href = `obsidian://research-shelf?id=${encodeURIComponent(sourceId)}`;
  return (
    <a className="hidden text-sm font-medium text-lab-accent md:inline" href={href}>
      Obsidian에서 열기
    </a>
  );
}
