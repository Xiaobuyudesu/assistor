import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

// 添加对仿宋字体的支持
const styles = `
  @font-face {
    font-family: 'FangSong';
    src: local('FangSong'), 
         local('STFangsong'),
         local('SimSun');
    font-weight: normal;
    font-style: normal;
  }
`;

export const metadata: Metadata = {
  title: "Qwen 智能助手",
  description: "一个类似ChatGPT的智能助手对话界面",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <head>
        <style>{styles}</style>
      </head>
      <body className={inter.className}>{children}</body>
    </html>
  );
}
