import React from 'react'
import { createRoot } from 'react-dom/client'
import '../styles/tailwind.css'

function DevtoolsPanel() {
  return (
    <div className="p-3 text-sm text-zinc-900">
      <div className="font-medium mb-2">Tailwind 编辑器（DevTools）</div>
      <div className="text-xs text-zinc-600">
        打开页面并使用扩展图标或快捷方式切换检查模式。
      </div>
    </div>
  )
}

const root = createRoot(document.getElementById('root')!)
root.render(<DevtoolsPanel />)
