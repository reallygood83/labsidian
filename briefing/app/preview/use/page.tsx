export default function UsePreviewPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-8 p-8">
      <section className="rounded-lab-l border border-lab-border p-4">
        <p className="text-sm text-lab-text-muted">검색 결과</p>
        <h2 className="text-lg font-semibold">영화 정책</h2>
        <p className="mt-2 text-sm text-lab-text-muted">영화진흥위원회 · 2024 · PDF 있음</p>
        <p className="mt-2 text-sm">정책 방향을 세 줄로 요약해요.<br />두 번째 줄입니다.<br />세 번째 줄입니다.</p>
        <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" defaultChecked /> 선택</label>
        <button className="mt-3 rounded-lab-m bg-lab-accent px-3 py-2 text-sm text-lab-on-accent" type="button">선택한 2개 저장</button>
        <p className="mt-3 text-sm">2/4 저장 중</p>
        <div className="mt-2 h-2 rounded-full bg-lab-border"><div className="h-2 w-1/2 rounded-full bg-lab-accent" /></div>
      </section>
      <section className="rounded-lab-l border border-lab-border p-4">
        <span className="rounded-full bg-lab-bg-subtle px-2 py-1 text-sm">이미 있어요</span>
        <button className="ml-3 text-sm text-lab-accent" type="button">열기</button>
      </section>
      <section className="rounded-lab-l border border-lab-border p-4">
        <p className="text-sm text-lab-text-muted">1/4</p>
        <h2 className="text-lg font-semibold">예시 검색</h2>
        <p className="mt-2">에디터에서 고른 문장으로 자료를 찾아요.</p>
        <div className="mt-4 flex gap-2">
          <button className="rounded-lab-m border border-lab-border px-3 py-2" type="button">건너뛰기</button>
          <button className="rounded-lab-m bg-lab-accent px-3 py-2 text-lab-on-accent" type="button">다음</button>
        </div>
      </section>
    </main>
  );
}
