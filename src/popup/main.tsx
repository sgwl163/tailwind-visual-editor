import React, { useCallback, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Crosshair, ExternalLink } from 'lucide-react'
import '../styles/tailwind.css'
import pkg from '../../package.json'

// 全局设置键（写入 chrome.storage.local）
const globalEnabledKey = 'tw_ve_global_enabled'
const inspectEnabledKey = 'tw_ve_inspect_enabled'

// 获取当前激活标签页（用于必要时注入 content script，触发页面同步）
async function getActiveTabId(): Promise<number | null> {
  return await new Promise(resolve => {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => resolve(tabs[0]?.id ?? null))
  })
}

// 读取布尔配置（统一封装）
async function getSettingBool(key: string, fallback: boolean): Promise<boolean> {
  return await new Promise(resolve => {
    chrome.storage.local.get({ [key]: fallback }, items => {
      const v = items[key]
      resolve(typeof v === 'boolean' ? v : fallback)
    })
  })
}

// 写入布尔配置（统一封装）
async function setSettingBool(key: string, v: boolean): Promise<void> {
  await new Promise<void>(resolve => {
    chrome.storage.local.set({ [key]: v }, () => resolve())
  })
}

// 注入 content script：用于让当前页面立刻感知全局开关变化
async function injectContentScript(tabId: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    chrome.scripting.executeScript({ target: { tabId }, files: ['assets/content.js'] }, () => {
      const err = chrome.runtime.lastError
      if (err) reject(err)
      else resolve()
    })
  })
}

function App() {
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [globalEnabled, setGlobalEnabledState] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 更新相关状态
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'checking' | 'latest' | 'update_available' | 'error'>('idle')
  const [latestVersion, setLatestVersion] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      // 打开 popup 时读取全局设置，渲染成“设置页开关”
      const g = await getSettingBool(globalEnabledKey, true)
      if (cancelled) return
      setGlobalEnabledState(g)
      try {
        const v = await getSettingBool(inspectEnabledKey, true)
        if (cancelled) return
        setEnabled(v)
      } catch {
        if (cancelled) return
        setError('读取状态失败，请刷新页面后重试')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const toggleGlobal = useCallback(async () => {
    if (busy) return
    const next = !(globalEnabled ?? true)
    setBusy(true)
    setError(null)
    try {
      await setSettingBool(globalEnabledKey, next)
      setGlobalEnabledState(next)
      const id = await getActiveTabId()
      if (id != null) await injectContentScript(id)
      setBusy(false)
    } catch {
      setError('设置失败，请重试')
      setBusy(false)
    }
  }, [busy, globalEnabled])

  const toggle = useCallback(async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const next = !(enabled ?? true)
      await setSettingBool(inspectEnabledKey, next)
      setEnabled(next)
      const id = await getActiveTabId()
      if (id != null) await injectContentScript(id)
      setBusy(false)
    } catch {
      setError('切换失败，请刷新页面后重试')
      setBusy(false)
    }
  }, [busy, enabled])

  const checkUpdate = useCallback(async () => {
    if (updateStatus === 'checking') return
    setUpdateStatus('checking')
    try {
      // 这里使用一个假定的示例 API (或者您可以将其替换为真实的 Github API)
      // 示例: 获取 GitHub Release 的最新版本号
      // const res = await fetch('https://api.github.com/repos/YOUR_ORG/YOUR_REPO/releases/latest')
      // const data = await res.json()
      // const remoteVersion = data.tag_name.replace('v', '')
      
      // 为了演示，这里模拟网络请求和返回一个比当前大的版本号
      await new Promise(resolve => setTimeout(resolve, 800))
      
      // 假设远端获取到的版本号是 0.2.0 (您可以根据实际逻辑修改)
      const remoteVersion = '0.2.0' 
      
      // 简单的版本号比较逻辑 (假设格式为 x.y.z)
      const currentParts = pkg.version.split('.').map(Number)
      const remoteParts = remoteVersion.split('.').map(Number)
      
      let isNewer = false
      for (let i = 0; i < 3; i++) {
        if (remoteParts[i] > currentParts[i]) {
          isNewer = true
          break
        } else if (remoteParts[i] < currentParts[i]) {
          break
        }
      }

      if (isNewer) {
        setLatestVersion(remoteVersion)
        setUpdateStatus('update_available')
      } else {
        setUpdateStatus('latest')
        // 3秒后恢复初始状态
        setTimeout(() => setUpdateStatus('idle'), 3000)
      }
    } catch (err) {
      setUpdateStatus('error')
      setTimeout(() => setUpdateStatus('idle'), 3000)
    }
  }, [updateStatus])

  return (
    <div className="w-[320px] p-3 text-zinc-900">
      <div className="flex items-center gap-2 px-1 py-1">
        <div className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white">
          <Crosshair size={16} />
        </div>
        <div className="flex-1">
          <div className="text-sm font-semibold leading-5">Tailwind 可视化编辑器</div>
          <div className="text-xs text-zinc-500 leading-4">设置</div>
        </div>
        <div className="text-xs text-zinc-500">{enabled == null ? '—' : enabled ? '已开启' : '已关闭'}</div>
      </div>

      <div className="mt-3 rounded-lg border border-zinc-200 bg-white">
        <div className="flex items-center gap-3 px-3 py-3 border-b border-zinc-200">
          <div className="flex-1">
            <div className="text-sm font-medium">全局显示可视化框</div>
            <div className="text-xs text-zinc-500 mt-0.5">关闭后所有页面都不显示面板</div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={globalEnabled ?? false}
            onClick={toggleGlobal}
            disabled={busy || globalEnabled == null}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
              globalEnabled ? 'bg-emerald-600' : 'bg-zinc-300'
            } ${busy || globalEnabled == null ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${
                globalEnabled ? 'translate-x-5' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
        <div className="flex items-center gap-3 px-3 py-3">
          <div className="flex-1">
            <div className="text-sm font-medium">检查模式</div>
            <div className="text-xs text-zinc-500 mt-0.5">在页面上悬停选择元素，点击锁定后编辑类名</div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={enabled ?? false}
            onClick={toggle}
            disabled={busy || enabled == null || globalEnabled === false}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
              enabled ? 'bg-emerald-600' : 'bg-zinc-300'
            } ${busy || enabled == null ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${
                enabled ? 'translate-x-5' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>

      <div className="mt-3 text-xs text-zinc-600 px-1">
        按 ESC 退出选择；状态会自动缓存并在刷新后保持。
      </div>

      <div className="mt-4 pt-3 border-t border-zinc-100 flex items-center justify-between px-1">
        <div className="flex flex-col gap-0.5">
          <a 
            href="https://www.thinkct.net/" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-xs font-medium text-emerald-600 hover:text-emerald-700 hover:underline flex items-center gap-1 transition-colors"
          >
            ThinkCT 官网
            <ExternalLink size={10} />
          </a>
          <span className="text-[10px] text-zinc-400">提供企业建站与数字化转型服务</span>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="text-[10px] font-mono text-zinc-400 bg-zinc-50 px-1.5 py-0.5 rounded border border-zinc-100">
            v{pkg.version}
          </div>
          <button 
            onClick={checkUpdate}
            disabled={updateStatus === 'checking'}
            className={`text-[9px] px-1.5 py-0.5 rounded transition-colors ${
              updateStatus === 'update_available' ? 'bg-amber-100 text-amber-700 font-medium hover:bg-amber-200' :
              updateStatus === 'latest' ? 'bg-emerald-50 text-emerald-600' :
              updateStatus === 'error' ? 'bg-red-50 text-red-500' :
              'text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100'
            }`}
          >
            {updateStatus === 'idle' && '检查更新'}
            {updateStatus === 'checking' && '检查中...'}
            {updateStatus === 'latest' && '已是最新'}
            {updateStatus === 'error' && '检查失败'}
            {updateStatus === 'update_available' && `发现新版 v${latestVersion}`}
          </button>
        </div>
      </div>

      {updateStatus === 'update_available' && (
        <div className="mt-2 mx-1 px-2 py-1.5 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800 flex justify-between items-center">
          <span>请前往官网下载最新版本。</span>
          <a href="https://www.thinkct.net/" target="_blank" rel="noopener noreferrer" className="font-medium underline hover:text-amber-900">
            去下载
          </a>
        </div>
      )}

      {error && <div className="text-xs text-red-600 mt-2 px-1">{error}</div>}
    </div>
  )
}

const root = createRoot(document.getElementById('root')!)
root.render(<App />)
