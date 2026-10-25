/** 공통 HTML·메타데이터와 전역 스타일을 연결하는 Next.js 루트입니다. */
import type { Metadata } from "next";
import "./globals.css";
import "./simple.css";
export const metadata: Metadata = {
  title: "SafeReport | 우리 동네의 작은 위험, 함께 고쳐요",
  description: "사진으로 시작하는 생활안전 신고 준비 도우미",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
