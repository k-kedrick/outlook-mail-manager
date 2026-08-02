import type { Metadata } from "next";
import { AppQueryProvider } from "@/features/query-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Outlook Mail Manager V2",
  description: "模块化 Outlook 与 Microsoft 365 邮箱管理平台",
};

export default function RootLayout({ children }: { children: React.ReactNode }): React.ReactNode {
  return (
    <html lang="zh-CN">
      <body><AppQueryProvider>{children}</AppQueryProvider></body>
    </html>
  );
}
