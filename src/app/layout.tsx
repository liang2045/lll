import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DingTalk AI Table Visualizer",
  description: "DingTalk sheet and AI table visualization sync workspace",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
