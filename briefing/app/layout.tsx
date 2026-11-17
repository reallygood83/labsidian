import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "Labsidian 주간 브리핑",
  description: "최근 7일 연구자료를 출처별로 봅니다.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body className="font-lab">{children}</body>
    </html>
  );
}
