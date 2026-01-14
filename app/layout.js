import "./globals.css";

export const metadata = {
  title: "智慧政务服务搜索 Demo",
  description: "基于大语言模型的意图识别搜索原型",
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <body className="bg-slate-50 min-h-screen text-slate-900">{children}</body>
    </html>
  );
}
