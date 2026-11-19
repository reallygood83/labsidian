"use client";

import { useEffect, useState } from "react";

export function OpenInObsidian({ sourceId }: { sourceId: string }) {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    setMobile(/Android|iPhone|iPad|Mobile/i.test(navigator.userAgent));
  }, []);
  if (mobile) return null;
  const href = `obsidian://research-shelf?id=${encodeURIComponent(sourceId)}`;
  return (
    <a className="text-sm font-medium text-lab-accent" href={href}>
      Obsidian에서 열기
    </a>
  );
}
