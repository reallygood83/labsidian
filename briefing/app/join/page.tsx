"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { buildInviteLinks, codeFromLocation, parseInviteParams } from "../../../packages/shared/team";

export default function JoinPage() {
  const [ready, setReady] = useState(false);
  const [obsidian, setObsidian] = useState("");
  const [svg, setSvg] = useState("");

  useEffect(() => {
    const { c, code } = codeFromLocation(window.location.search, window.location.hash);
    try {
      const parsed = parseInviteParams(c, code);
      const link = buildInviteLinks(parsed.config, parsed.code).obsidian;
      const self = `${window.location.origin}/join?c=${encodeURIComponent(c)}#t=${encodeURIComponent(code)}`;
      setObsidian(link);
      void QRCode.toString(self, { type: "svg", margin: 1, width: 220 }).then((value) => {
        setSvg(value);
        setReady(true);
      });
    } catch {
      setReady(false);
    }
  }, []);

  return (
    <main className="mx-auto max-w-xl p-8">
      <p className="text-sm text-lab-text-muted">Labsidian</p>
      <h1 className="text-2xl font-semibold">팀 초대</h1>
      {ready ? (
        <>
          <p className="mt-3">옵시디언에서 링크를 열면 메일과 비밀번호만으로 팀에 들어가요. 설정 파일은 만지지 않아요.</p>
          <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm">
            <li>옵시디언 1.11.4 이상을 설치해요.</li>
            <li>플러그인 압축을 풀어 <code>.obsidian/plugins/labsidian</code>에 넣어요.</li>
            <li>설정에서 제한 모드를 끄고 Labsidian을 켜요.</li>
            <li>메일의 인증 링크를 누른 뒤 로그인해요.</li>
          </ol>
          <a className="mt-6 inline-block rounded-lab-m bg-lab-accent px-4 py-2 font-medium text-lab-on-accent" href={obsidian}>
            Obsidian에서 열기
          </a>
          <div className="mt-6" dangerouslySetInnerHTML={{ __html: svg }} />
        </>
      ) : (
        <p className="mt-3">초대 링크가 완전하지 않아요. 관리자에게 새 링크를 요청해 주세요.</p>
      )}
    </main>
  );
}
