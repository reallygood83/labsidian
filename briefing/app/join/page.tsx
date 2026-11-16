import { headers } from "next/headers";
import QRCode from "qrcode";
import { buildInviteLinks, parseInviteParams } from "../../../packages/shared/team";

export const dynamic = "force-dynamic";

export default async function JoinPage({ searchParams }: { searchParams: Promise<{ c?: string; t?: string }> }) {
  const params = await searchParams;
  const c = params.c ?? "";
  const t = params.t ?? "";
  let ready = true;
  let obsidian = "";
  try {
    const parsed = parseInviteParams(c, t);
    obsidian = buildInviteLinks(parsed.config, parsed.code).obsidian;
  } catch {
    ready = false;
  }
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "";
  const proto = headerList.get("x-forwarded-proto") ?? "https";
  const self = host ? `${proto}://${host}/join?c=${encodeURIComponent(c)}&t=${encodeURIComponent(t)}` : obsidian;
  const svg = ready ? await QRCode.toString(self, { type: "svg", margin: 1, width: 220 }) : "";
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
            <li>아래 버튼을 누르면 가입 창이 열려요.</li>
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
