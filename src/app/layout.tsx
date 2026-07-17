import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Claude 무료 채팅",
  description:
    "백엔드에서 Claude API를 호출하는 무료 채팅. API 키는 서버에만 있으며 브라우저에 노출되지 않습니다.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body className="bg-[#F5F4EF] text-[#1F1E1B] antialiased">{children}</body>
    </html>
  );
}
