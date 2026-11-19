export default function ModePreviewPage() {
  return (
    <main className="mx-auto max-w-xl p-8">
      <p className="text-sm text-lab-text-muted">Research Shelf 설정</p>
      <h1 className="text-3xl font-semibold">안 됨</h1>
      <p className="mt-2 text-lab-text-muted">혼자 쓰기예요. 노트는 이 볼트에만 있어요.</p>
      <div className="mt-6 flex gap-3">
        <button className="rounded-lab-m bg-lab-accent px-4 py-2 font-medium text-lab-on-accent" type="button">혼자 쓰기</button>
        <button className="rounded-lab-m border border-lab-border px-4 py-2" type="button">팀으로 쓰기</button>
      </div>
      <button className="mt-4 rounded-lab-m border border-lab-border px-4 py-2" type="button">내 클라우드 연결</button>
      <p className="mt-4 text-sm text-lab-text-muted">기본은 나만 보기예요. 공개로 고른 글만 브리핑에 나와요.</p>
    </main>
  );
}
