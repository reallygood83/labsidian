import { FIRESTORE_RULES } from "../../../packages/shared/rulesText";
import { setupSteps } from "../../../packages/shared/team";

export default function GuidePage() {
  const steps = setupSteps("");
  return (
    <main className="mx-auto max-w-2xl p-8">
      <p className="text-sm text-lab-text-muted">관리자 · 약 5분</p>
      <h1 className="text-2xl font-semibold">팀 서고 만들기</h1>
      <ol className="mt-6 space-y-4">
        {steps.map((step, index) => (
          <li key={step.title} className="rounded-lab-l border border-lab-border p-4">
            <p className="font-semibold">{index + 1}. {step.title}</p>
            <p className="mt-1 text-sm text-lab-text-muted">{step.detail}</p>
            <a className="mt-2 inline-block text-sm text-lab-accent" href={step.href}>콘솔 열기</a>
          </li>
        ))}
      </ol>
      <p className="mt-6 text-sm">5. 규칙 붙여넣기에서 플러그인의 규칙 복사 버튼을 눌러 콘솔에 게시해요.</p>
      <pre className="mt-3 max-h-40 overflow-hidden rounded-lab-m bg-lab-bg-subtle p-3 text-xs">{FIRESTORE_RULES.slice(0, 280)}</pre>
      <h2 className="mt-10 text-xl font-semibold">참가자 · 약 1분</h2>
      <ol className="mt-3 list-decimal space-y-2 pl-5">
        <li>초대 링크를 열어요.</li>
        <li>옵시디언에서 열기를 눌러요.</li>
        <li>메일과 비밀번호로 가입하기를 눌러요.</li>
      </ol>
    </main>
  );
}
