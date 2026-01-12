import './globals.css'

export const metadata = {
  title: '智慧政务服务搜索 Demo',
  description: '基于大模型的语义搜索演示',
}

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN">
      <head>
        <script src="https://cdn.tailwindcss.com"></script>
      </head>
      <body className="bg-gray-50 min-h-screen text-gray-900">{children}</body>
    </html>
  )
}
