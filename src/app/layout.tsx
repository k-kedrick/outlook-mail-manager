import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Outlook 邮箱管理",
  description: "批量管理 Outlook / MSA 账号、读取收件箱、提取验证码、检测账号健康",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactNode {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
