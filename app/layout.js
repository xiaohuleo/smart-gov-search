import './globals.css'

export const metadata = {
  title: '政务智能搜索 - 多模型测速版',
  description: '支持切换 Groq, DeepSeek, OpenAI 进行速度测试',
}

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <head>
        <script src="https://cdn.tailwindcss.com"></script>
      </head>
      <body className="bg-slate-50 min-h-screen text-slate-900">{children}</body>
    </html>
  )
}
