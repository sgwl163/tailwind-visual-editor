import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ChevronDown, ChevronUp, Copy, Crosshair, Plus, RotateCcw, X, LayoutTemplate, Type, Box, Layers, AlignVerticalSpaceAround, AlignHorizontalSpaceAround, Columns, Rows, ArrowRightLeft } from 'lucide-react'
import { AutocompleteInput } from './autocomplete'

type Message = { type: 'TW_TOGGLE' } | { type: 'TW_GET_ENABLED' }

const containerId = '__tw_visual_editor__'
// 全局开关：是否显示可视化面板（所有页面同步）
const globalEnabledStorageKey = 'tw_ve_global_enabled'
// 全局开关：是否启用“检查模式”（所有页面同步）
const inspectEnabledStorageKey = 'tw_ve_inspect_enabled'
// 面板位置（所有页面同步）
const panelPosStorageKey = 'tw_ve_panel_pos'
// 面板折叠状态（所有页面同步）
const panelCollapsedStorageKey = 'tw_ve_panel_collapsed'
const msgListenerInstalledFlag = '__tw_ve_msg_listener_installed__'

// 面板根节点引用（用于识别“事件是否发生在面板内”）
let panelRootEl: HTMLElement | null = null

function getStorageBool(key: string, fallback: boolean, cb: (v: boolean) => void) {
  chrome.storage.local.get({ [key]: fallback }, items => {
    const v = items[key]
    cb(typeof v === 'boolean' ? v : fallback)
  })
}

function setStorageBool(key: string, v: boolean, cb?: () => void) {
  chrome.storage.local.set({ [key]: v }, () => cb?.())
}

function getInspectEnabled(cb: (v: boolean) => void) {
  getStorageBool(inspectEnabledStorageKey, true, cb)
}

function setInspectEnabled(v: boolean, cb?: () => void) {
  setStorageBool(inspectEnabledStorageKey, v, cb)
}

type PanelPos = { x: number; y: number }

// content script 顶层注册消息监听，避免 React 未挂载时丢消息
if (!(globalThis as unknown as Record<string, unknown>)[msgListenerInstalledFlag]) {
  ;(globalThis as unknown as Record<string, unknown>)[msgListenerInstalledFlag] = true
  chrome.runtime.onMessage.addListener((msg: Message, _sender, sendResponse) => {
    if (msg?.type === 'TW_TOGGLE') {
      getInspectEnabled(current => {
        const next = !current
        setInspectEnabled(next, () => {
          try {
            sendResponse?.({ ok: true, enabled: next })
          } catch {}
        })
      })
      return true
    }
    if (msg?.type === 'TW_GET_ENABLED') {
      getInspectEnabled(enabled => {
        try {
          sendResponse?.({ ok: true, enabled })
        } catch {}
      })
      return true
    }
  })
}

// 通过坐标命中判断是否点在面板内（Shadow DOM 场景也稳定）
function isEventFromPanel(e: MouseEvent) {
  if (!panelRootEl) return false
  const r = panelRootEl.getBoundingClientRect()
  if (r.width <= 0 || r.height <= 0) return false
  return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom
}

type Token = { val: string; disabled: boolean }

function useInspector() {
  const [isInitializing, setIsInitializing] = useState(true)
  const [enabled, setEnabled] = useState(false) // 默认不启用，等存储加载完
  const [globalEnabled, setGlobalEnabled] = useState(false) // 默认不显示，等存储加载完
  const [target, setTarget] = useState<HTMLElement | null>(null)
  const [hoverEl, setHoverEl] = useState<HTMLElement | null>(null)
  const [tokens, setTokens] = useState<Token[]>([])
  const [originalTokens, setOriginalTokens] = useState<Token[]>([])
  // 不再使用简单的 outline，改为提供 overlay 需要的数据
  const [overlayRect, setOverlayRect] = useState<DOMRect | null>(null)

  useEffect(() => {
    // 初始化：读取全局开关状态
    chrome.storage.local.get(
      { [globalEnabledStorageKey]: true, [inspectEnabledStorageKey]: true },
      items => {
        const g = items[globalEnabledStorageKey]
        const e = items[inspectEnabledStorageKey]
        setGlobalEnabled(typeof g === 'boolean' ? g : false)
        setEnabled(typeof e === 'boolean' ? e : false)
        setIsInitializing(false)
      }
    )
    const onChanged = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string
    ) => {
      if (areaName !== 'local') return
      // 同步：任意页面修改 storage 后，所有页面都能接收到更新
      const cg = changes[globalEnabledStorageKey]
      if (cg) {
        const v = cg.newValue
        setGlobalEnabled(typeof v === 'boolean' ? v : false)
      }
      const ce = changes[inspectEnabledStorageKey]
      if (ce) {
        const v = ce.newValue
        const nextEnabled = typeof v === 'boolean' ? v : false
        setEnabled(nextEnabled)
        // 如果是从外部关闭检查模式，也清除本地选中状态
        if (!nextEnabled) {
          setTarget(null)
          setHoverEl(null)
          setOverlayRect(null)
        }
      }
    }
    chrome.storage.onChanged.addListener(onChanged)
    return () => chrome.storage.onChanged.removeListener(onChanged)
  }, [])

  useEffect(() => {
    if (isInitializing) return
    if (!enabled || !globalEnabled) {
      if (!globalEnabled) {
        setTarget(null)
        setHoverEl(null)
        setOverlayRect(null)
      }
      // 注意：如果是 `!enabled` (且没有其他触发)，由于我们在 onChanged 和 Esc、Toggle 处都做了清理，这里不需要再重复清空
      // 但是要确保 return 不绑定事件
      return
    }
    const onMove = (e: MouseEvent) => {
      if (isEventFromPanel(e)) return
      // 如果已经有选中的 target，就不再响应 hover 选中新元素
      if (target) return

      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null
      if (el && el !== hoverEl) {
        setHoverEl(el)
        setOverlayRect(el.getBoundingClientRect())
      }
    }
    const onClick = (e: MouseEvent) => {
      if (isEventFromPanel(e)) return
      e.preventDefault()
      e.stopPropagation()
      
      // 如果已经有选中的目标元素，点击任何区域都会取消选中，恢复悬停选择模式
      if (target) {
        setTarget(null)
        // 注意：不设置 setHoverEl(null)，让下一次 onMove 自己去获取当前鼠标下的元素
        // 如果想要立即关闭检查模式也可以，但通常取消选中意味着重新开始选择
        setEnabled(true)
        setInspectEnabled(true)
        return
      }

      // 如果当前没有选中元素，则执行选中逻辑
      const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null
      
      if (el) {
        setTarget(el)
        setHoverEl(el)
        setOverlayRect(el.getBoundingClientRect())
        const arr = Array.from(new Set((el.className || '').trim().split(/\s+/).filter(Boolean)))
        const initialTokens = arr.map(val => ({ val, disabled: false }))
        setTokens(initialTokens)
        setOriginalTokens(initialTokens)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setEnabled(false)
        setInspectEnabled(false)
        setTarget(null)
        setHoverEl(null)
        setOverlayRect(null)
      }
    }
    document.addEventListener('mousemove', onMove, true)
    document.addEventListener('click', onClick, true)
    document.addEventListener('keydown', onKey, true)
    document.documentElement.classList.add('tw-ve-grab')
    return () => {
      document.removeEventListener('mousemove', onMove, true)
      document.removeEventListener('click', onClick, true)
      document.removeEventListener('keydown', onKey, true)
      document.documentElement.classList.remove('tw-ve-grab')
    }
  }, [isInitializing, enabled, globalEnabled, hoverEl, target])

  // 添加滚动和缩放监听，实时更新高亮框位置
  useEffect(() => {
    if (isInitializing || !globalEnabled) return
    const activeEl = target || (enabled ? hoverEl : null)
    if (!activeEl) return

    const updateRect = () => {
      setOverlayRect(activeEl.getBoundingClientRect())
    }

    document.addEventListener('scroll', updateRect, true)
    window.addEventListener('resize', updateRect, true)
    return () => {
      document.removeEventListener('scroll', updateRect, true)
      window.removeEventListener('resize', updateRect, true)
    }
  }, [isInitializing, globalEnabled, enabled, hoverEl, target])

  const apply = (newTokens: Token[]) => {
    if (target) {
      const className = newTokens.filter(t => !t.disabled).map(t => t.val).join(' ')
      target.className = className
      setTokens(newTokens)
      // 应用样式后，更新高亮框大小
      requestAnimationFrame(() => {
        setOverlayRect(target.getBoundingClientRect())
      })
    }
  }

  const restore = () => {
    if (target && originalTokens) {
      const className = originalTokens.filter(t => !t.disabled).map(t => t.val).join(' ')
      target.className = className
      setTokens(originalTokens)
      requestAnimationFrame(() => {
        setOverlayRect(target.getBoundingClientRect())
      })
    }
  }

  return { isInitializing, enabled, setEnabled, globalEnabled, target, hoverEl, overlayRect, tokens, originalTokens, setTokens, apply, restore }
}

function Panel() {
  const { isInitializing, enabled, setEnabled, globalEnabled, target, hoverEl, overlayRect, tokens, originalTokens, setTokens, apply, restore } = useInspector()
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [isPanelInitializing, setIsPanelInitializing] = useState(true)
  const [pos, setPos] = useState<PanelPos | null>(null)
  const [collapsed, setCollapsed] = useState(false)
  const [copyState, setCopyState] = useState<'idle' | 'ok' | 'err'>('idle')
  const copyTimer = useRef<number | null>(null)
  const posRef = useRef<PanelPos | null>(null)
  const dragRef = useRef<{
    pointerId: number
    offsetX: number
    offsetY: number
    width: number
    height: number
    rafId: number | null
    nextPos: PanelPos | null
  } | null>(null)
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [editingVal, setEditingVal] = useState('')
  const [newVal, setNewVal] = useState('')
  const [mainTab, setMainTab] = useState<'raw' | 'visual'>('raw')
  const [visualTab, setVisualTab] = useState<'layout' | 'flexbox'>('layout')
  useEffect(() => {
    posRef.current = pos
  }, [pos])
  useEffect(() => {
    panelRootEl = rootRef.current
    return () => {
      if (panelRootEl === rootRef.current) panelRootEl = null
    }
  }, [])
  useEffect(() => {
    chrome.storage.local.get({ [panelPosStorageKey]: null, [panelCollapsedStorageKey]: false }, items => {
      const v = items[panelPosStorageKey] as unknown
      const x = (v as { x?: unknown } | null)?.x
      const y = (v as { y?: unknown } | null)?.y
      if (typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y)) {
        setPos({ x, y })
      }
      const c = items[panelCollapsedStorageKey]
      setCollapsed(typeof c === 'boolean' ? c : false)
      setIsPanelInitializing(false)
    })
    const onChanged = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string
    ) => {
      if (areaName !== 'local') return
      const cp = changes[panelPosStorageKey]
      if (cp) {
        const v = cp.newValue as unknown
        const x = (v as { x?: unknown } | null)?.x
        const y = (v as { y?: unknown } | null)?.y
        if (typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y)) {
          setPos({ x, y })
        } else {
          setPos(null)
        }
      }
      const cc = changes[panelCollapsedStorageKey]
      if (cc) {
        const v = cc.newValue
        setCollapsed(typeof v === 'boolean' ? v : false)
      }
    }
    chrome.storage.onChanged.addListener(onChanged)
    return () => chrome.storage.onChanged.removeListener(onChanged)
  }, [])

  useEffect(() => {
    if (!pos || isInitializing || isPanelInitializing || !globalEnabled) return
    const root = rootRef.current
    if (!root) return

    // 使用 requestAnimationFrame 确保在 DOM 真正渲染并应用了 CSS 后再计算尺寸
    // 避免在 display 刚从 none 切换过来时，拿不到真实的 getBoundingClientRect
    const timer = requestAnimationFrame(() => {
      const rect = root.getBoundingClientRect()
      // 如果获取到的宽高还是0，说明还没渲染好，跳过这次计算
      if (rect.width === 0 || rect.height === 0) return

      const width = rect.width
      const height = rect.height
      const maxX = Math.max(0, window.innerWidth - width)
      const maxY = Math.max(0, window.innerHeight - height)
      const x = Math.min(Math.max(0, pos.x), maxX)
      const y = Math.min(Math.max(0, pos.y), maxY)
      
      if (x === pos.x && y === pos.y) return
      
      const next = { x, y }
      setPos(next)
      chrome.storage.local.set({ [panelPosStorageKey]: next })
    })

    return () => cancelAnimationFrame(timer)
  }, [pos, isInitializing, isPanelInitializing, globalEnabled])

  const resetPos = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setPos(null)
    chrome.storage.local.remove(panelPosStorageKey)
  }

  useEffect(() => {
    return () => {
      if (copyTimer.current != null) window.clearTimeout(copyTimer.current)
    }
  }, [])

  const copyClasses = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const text = (target ? target.className : tokens.filter(t => !t.disabled).map(t => t.val).join(' ')).trim()
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopyState('ok')
    } catch {
      try {
        const ta = document.createElement('textarea')
        ta.value = text
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
        setCopyState('ok')
      } catch {
        setCopyState('err')
      }
    } finally {
      if (copyTimer.current != null) window.clearTimeout(copyTimer.current)
      copyTimer.current = window.setTimeout(() => setCopyState('idle'), 1200)
    }
  }

  const toggleCollapsed = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setCollapsed(v => {
      const next = !v
      chrome.storage.local.set({ [panelCollapsedStorageKey]: next })
      return next
    })
  }

  const toggleInspect = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setEnabled(v => {
      const next = !v
      setInspectEnabled(next)
      return next
    })
  }

  const startDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    const t = e.target as HTMLElement | null
    if (t?.closest('button, input, textarea, select')) return
    const root = rootRef.current
    if (!root) return
    const rect = root.getBoundingClientRect()
    // 获取实时的位置，如果 pos 还没更新完毕，使用 boundingClientRect 计算
    const startPos = posRef.current ?? { x: rect.left, y: rect.top }
    // 修正：offsetX 是鼠标在面板内部的相对位置，需要用 e.clientX - rect.left 计算
    const offsetX = e.clientX - rect.left
    const offsetY = e.clientY - rect.top
    const width = rect.width
    const height = rect.height
    dragRef.current = { pointerId: e.pointerId, offsetX, offsetY, width, height, rafId: null, nextPos: null }
    setPos(startPos)
    e.preventDefault()
    e.stopPropagation()
    try {
      const root = rootRef.current
      if (root) {
        root.setPointerCapture(e.pointerId)
      }
    } catch (err) {
      // fallback if element doesn't support capture
    }

    const schedule = (p: PanelPos) => {
      const s = dragRef.current
      if (!s) return
      s.nextPos = p
      if (s.rafId != null) return
      s.rafId = window.requestAnimationFrame(() => {
        const cur = dragRef.current
        if (!cur) return
        cur.rafId = null
        if (cur.nextPos) setPos(cur.nextPos)
      })
    }

    const onMove = (ev: PointerEvent) => {
      const s = dragRef.current
      if (!s || ev.pointerId !== s.pointerId) return
      // 使用 window.innerWidth/innerHeight 减去面板自身宽高来限制拖动范围
      // 预留 20px，避免面板边缘紧贴屏幕边缘难以抓取
      const margin = 20
      const maxX = Math.max(0, window.innerWidth - s.width + margin)
      const maxY = Math.max(0, window.innerHeight - s.height + margin)
      const x = Math.min(Math.max(-margin, ev.clientX - s.offsetX), maxX)
      const y = Math.min(Math.max(-margin, ev.clientY - s.offsetY), maxY)
      schedule({ x, y })
    }

    const end = (ev: PointerEvent) => {
      const s = dragRef.current
      if (!s || ev.pointerId !== s.pointerId) return
      if (s.rafId != null) window.cancelAnimationFrame(s.rafId)
      dragRef.current = null
      window.removeEventListener('pointermove', onMove, true)
      window.removeEventListener('pointerup', end, true)
      window.removeEventListener('pointercancel', end, true)
      const p = posRef.current
      if (p) chrome.storage.local.set({ [panelPosStorageKey]: p })
      try {
        const root = rootRef.current
        if (root) {
          root.releasePointerCapture(ev.pointerId)
        }
      } catch (e) {
        // ignore
      }
    }

    window.addEventListener('pointermove', onMove, true)
    window.addEventListener('pointerup', end, true)
    window.addEventListener('pointercancel', end, true)
  }

  const commitTokens = (arr: Token[]) => {
    // 处理去重，保留最新状态
    const map = new Map<string, Token>()
    arr.forEach(t => {
      if (t.val && !map.has(t.val)) map.set(t.val, t)
    })
    const next = Array.from(map.values())
    if (!target) {
      // 如果没有 target（例如手动编辑模式），也更新本地状态
      setTokens(next)
    } else {
      apply(next)
    }
  }

  const removeToken = (i: number) => {
    const next = tokens.slice()
    next.splice(i, 1)
    commitTokens(next)
  }

  const toggleTokenDisable = (i: number) => {
    const next = tokens.slice()
    next[i] = { ...next[i], disabled: !next[i].disabled }
    commitTokens(next)
  }

  const startEdit = (i: number) => {
    setEditingIdx(i)
    setEditingVal(tokens[i].val ?? '')
  }

  const saveEdit = (finalValue?: string) => {
    if (editingIdx == null) return
    const next = tokens.slice()
    const v = (finalValue ?? editingVal).trim()
    if (v) {
      next[editingIdx] = { ...next[editingIdx], val: v }
    } else {
      next.splice(editingIdx, 1)
    }
    commitTokens(next)
    setEditingIdx(null)
    setEditingVal('')
  }

  const cancelEdit = () => {
    setEditingIdx(null)
    setEditingVal('')
  }

  const addToken = (tokenStr?: string) => {
    // 如果有传入的 tokenStr 则使用它，否则使用当前的 newVal
    const v = (tokenStr ?? newVal).trim()
    if (!v) return
    const next = tokens.concat({ val: v, disabled: false })
    commitTokens(next)
    setNewVal('')
  }

  // Visual Builder Helpers
  const hasClass = (cls: string) => tokens.some(t => t.val === cls && !t.disabled)
  const toggleClass = (cls: string, group: string[] = []) => {
    let next = tokens.slice()
    if (group.length > 0) {
      next = next.filter(t => !group.includes(t.val))
    }
    if (!next.some(t => t.val === cls)) {
      next.push({ val: cls, disabled: false })
    }
    commitTokens(next)
  }
  const setClassFromGroup = (cls: string | null, group: string[]) => {
    let next = tokens.filter(t => !group.includes(t.val))
    if (cls) next.push({ val: cls, disabled: false })
    commitTokens(next)
  }

  const displayGroup = ['block', 'inline-block', 'inline', 'flex', 'inline-flex', 'grid', 'inline-grid', 'hidden']
  const visibilityGroup = ['visible', 'invisible', 'collapse']
  
  // Flexbox Groups
  const flexDirectionGroup = ['flex-row', 'flex-row-reverse', 'flex-col', 'flex-col-reverse']
  const flexWrapGroup = ['flex-wrap', 'flex-wrap-reverse', 'flex-nowrap']
  const alignItemsGroup = ['items-start', 'items-end', 'items-center', 'items-baseline', 'items-stretch']
  const justifyContentGroup = ['justify-normal', 'justify-start', 'justify-end', 'justify-center', 'justify-between', 'justify-around', 'justify-evenly', 'justify-stretch']
  
  const currentDisplay = displayGroup.find(hasClass) || ''
  const currentVisibility = visibilityGroup.find(hasClass) || ''
  const currentFlexDirection = flexDirectionGroup.find(hasClass) || ''
  const currentFlexWrap = flexWrapGroup.find(hasClass) || ''
  const currentAlignItems = alignItemsGroup.find(hasClass) || ''
  const currentJustifyContent = justifyContentGroup.find(hasClass) || ''

  // 获取计算后的样式以显示边距
  const activeElForOverlay = target || (enabled ? hoverEl : null)
  // 如果有 target (被选中锁定)，就不再显示内外边距的高亮色块，保持画面清爽
  const showBoxModel = !target
  const computedStyle = (activeElForOverlay && showBoxModel) ? window.getComputedStyle(activeElForOverlay) : null

  return (
    <>
      {/* 元素高亮 Overlay */}
      {globalEnabled && overlayRect && activeElForOverlay && (
        <div 
          className="fixed pointer-events-none z-[2147483646]"
          style={{
            left: overlayRect.left,
            top: overlayRect.top,
            width: overlayRect.width,
            height: overlayRect.height,
          }}
        >
          {/* Margin 层 */}
          {computedStyle && (
            <div 
              className="absolute pointer-events-none border-[rgba(246,178,107,0.8)] bg-[rgba(246,178,107,0.4)]"
              style={{
                top: -parseFloat(computedStyle.marginTop),
                bottom: -parseFloat(computedStyle.marginBottom),
                left: -parseFloat(computedStyle.marginLeft),
                right: -parseFloat(computedStyle.marginRight),
                borderTopWidth: parseFloat(computedStyle.marginTop),
                borderBottomWidth: parseFloat(computedStyle.marginBottom),
                borderLeftWidth: parseFloat(computedStyle.marginLeft),
                borderRightWidth: parseFloat(computedStyle.marginRight),
                borderStyle: 'solid',
                boxSizing: 'border-box'
              }}
            />
          )}

          {/* Padding 层 */}
          {computedStyle && (
            <div 
              className="absolute inset-0 pointer-events-none border-[rgba(147,196,125,0.8)] bg-[rgba(147,196,125,0.4)]"
              style={{
                borderTopWidth: parseFloat(computedStyle.paddingTop),
                borderBottomWidth: parseFloat(computedStyle.paddingBottom),
                borderLeftWidth: parseFloat(computedStyle.paddingLeft),
                borderRightWidth: parseFloat(computedStyle.paddingRight),
                borderStyle: 'solid',
                boxSizing: 'border-box'
              }}
            />
          )}

          {/* 内容区 */}
          {computedStyle && (
            <div 
              className="absolute pointer-events-none bg-[rgba(111,168,220,0.6)]"
              style={{
                top: parseFloat(computedStyle.paddingTop),
                bottom: parseFloat(computedStyle.paddingBottom),
                left: parseFloat(computedStyle.paddingLeft),
                right: parseFloat(computedStyle.paddingRight),
              }}
            />
          )}

          {/* 主体边框 */}
          <div className="absolute inset-0 border-[2px] border-indigo-500 box-border z-10" />
          
          {/* 信息标签 */}
          <div className="absolute -top-[24px] right-0 bg-zinc-900 text-zinc-100 text-[10px] font-mono px-2 py-1 rounded shadow-md flex items-center gap-2 whitespace-nowrap border border-zinc-700/50 z-10">
            <span className="font-bold text-indigo-400">{activeElForOverlay.tagName.toLowerCase()}</span>
            <div className="w-px h-2.5 bg-zinc-600"></div>
            <span className="opacity-90">
              {Math.round(overlayRect.width)}<span className="text-zinc-500 mx-0.5">×</span>{Math.round(overlayRect.height)}
            </span>
            {/* 显示 margin/padding 数值 (仅当非零时) */}
            {computedStyle && (parseFloat(computedStyle.marginTop) > 0 || parseFloat(computedStyle.paddingTop) > 0) && (
               <>
                 <div className="w-px h-2.5 bg-zinc-600"></div>
                 <div className="flex gap-1.5 opacity-80 text-[9px]">
                   {parseFloat(computedStyle.marginTop) > 0 && <span className="text-orange-300">m:{parseFloat(computedStyle.marginTop)}</span>}
                   {parseFloat(computedStyle.paddingTop) > 0 && <span className="text-emerald-300">p:{parseFloat(computedStyle.paddingTop)}</span>}
                 </div>
               </>
            )}
          </div>
        </div>
      )}

      {/* 辅助线：水平和垂直 */}
      {enabled && globalEnabled && overlayRect && (
        <div className="fixed inset-0 pointer-events-none z-[2147483645] overflow-hidden">
          {/* 水平辅助线 - 顶部 */}
          <div 
            className="absolute left-0 right-0 border-t-[2px] border-dashed border-indigo-400/90 shadow-[0_0_2px_rgba(255,255,255,0.5)]"
            style={{ 
              top: overlayRect.top,
              backgroundClip: 'padding-box',
              borderImage: 'repeating-linear-gradient(to right, transparent, transparent 8px, currentColor 8px, currentColor 16px) 1'
            }}
          />
          {/* 水平辅助线 - 底部 */}
          <div 
            className="absolute left-0 right-0 border-t-[2px] border-dashed border-indigo-400/90 shadow-[0_0_2px_rgba(255,255,255,0.5)]"
            style={{ 
              top: overlayRect.bottom,
              backgroundClip: 'padding-box',
              borderImage: 'repeating-linear-gradient(to right, transparent, transparent 8px, currentColor 8px, currentColor 16px) 1'
            }}
          />
          {/* 垂直辅助线 - 左侧 */}
          <div 
            className="absolute top-0 bottom-0 border-l-[2px] border-dashed border-indigo-400/90 shadow-[0_0_2px_rgba(255,255,255,0.5)]"
            style={{ 
              left: overlayRect.left,
              backgroundClip: 'padding-box',
              borderImage: 'repeating-linear-gradient(to bottom, transparent, transparent 8px, currentColor 8px, currentColor 16px) 1'
            }}
          />
          {/* 垂直辅助线 - 右侧 */}
          <div 
            className="absolute top-0 bottom-0 border-l-[2px] border-dashed border-indigo-400/90 shadow-[0_0_2px_rgba(255,255,255,0.5)]"
            style={{ 
              left: overlayRect.right,
              backgroundClip: 'padding-box',
              borderImage: 'repeating-linear-gradient(to bottom, transparent, transparent 8px, currentColor 8px, currentColor 16px) 1'
            }}
          />
        </div>
      )}

      {/* 主控制面板 */}
      <div
        ref={rootRef}
        style={{
          ...(pos
            ? { left: `${pos.x}px`, top: `${pos.y}px`, right: 'auto', bottom: 'auto' }
            : { right: '1rem', bottom: '1rem' }),
          ...(isInitializing || isPanelInitializing || !globalEnabled ? { display: 'none' } : {})
        }}
        className={`fixed z-[2147483647] w-[420px] max-w-[90vw] rounded-2xl border border-zinc-200/60 bg-white/95 backdrop-blur-xl shadow-[0_8px_30px_rgb(0,0,0,0.08)] text-zinc-900 transition-opacity duration-200 ${
          globalEnabled && !isInitializing && !isPanelInitializing ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
      <div className="flex items-center gap-2 border-b border-zinc-100/80 px-3 py-3 select-none cursor-move bg-zinc-50/50 rounded-t-2xl" onPointerDown={startDrag}>
        <div className="tw-ve-badge inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-zinc-800 rounded-md shadow-sm">
          <span className="inline-flex text-emerald-400"><Crosshair size={13} strokeWidth={2.5} /></span>
          <span className="text-[11px] font-semibold text-zinc-100 tracking-wide">Tailwind 编辑器</span>
        </div>
        <div className="flex-1 text-[10px] text-zinc-400 font-medium tracking-wider uppercase px-2">PRESS ESC TO EXIT</div>
        
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            className="p-1 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-200/60 rounded-md transition-colors"
            onClick={resetPos}
            title="重置位置"
          >
            <RotateCcw size={12} strokeWidth={2} />
          </button>
          <button
            type="button"
            className="p-1 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-200/60 rounded-md transition-colors"
            onClick={toggleCollapsed}
            title={collapsed ? '展开' : '折叠'}
          >
            {collapsed ? <ChevronUp size={14} strokeWidth={2} /> : <ChevronDown size={14} strokeWidth={2} />}
          </button>
          <div className="w-px h-3 bg-zinc-200/80 mx-1.5"></div>
          <button
            type="button"
            className={`text-[10px] px-2 py-1 rounded-md font-medium transition-all duration-200 flex items-center gap-1.5 ${
              enabled 
                ? 'text-emerald-600 bg-emerald-50 hover:bg-emerald-100' 
                : 'text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100'
            }`}
            onClick={toggleInspect}
            title="开关检查模式"
          >
            <span className={`w-1 h-1 rounded-full ${enabled ? 'bg-emerald-500 shadow-[0_0_4px_rgb(16,185,129,0.6)]' : 'bg-zinc-400'}`}></span>
            {enabled ? '检查中' : '已关闭'}
          </button>
        </div>
      </div>
      
      <div className={`p-4 space-y-4 max-h-[70vh] overflow-y-auto ${collapsed ? 'hidden' : ''} tw-ve-scrollbar`}>
        <div className="flex items-center justify-between border-b border-zinc-100/80 pb-3 sticky top-0 bg-white/95 backdrop-blur z-10 -mx-4 px-4 -mt-4 pt-4">
          <div className="flex items-center gap-1 bg-zinc-100/60 p-1 rounded-lg border border-zinc-200/50">
            <button 
              className={`px-3 py-1.5 rounded-md text-[11px] font-semibold transition-all duration-200 ${mainTab === 'raw' ? 'bg-white text-zinc-800 shadow-[0_1px_3px_rgb(0,0,0,0.05)]' : 'text-zinc-500 hover:text-zinc-700'}`}
              onClick={() => setMainTab('raw')}
            >
              <span className="flex items-center gap-1.5"><Type size={13} /> 类名</span>
            </button>
            <button 
              className={`px-3 py-1.5 rounded-md text-[11px] font-semibold transition-all duration-200 ${mainTab === 'visual' ? 'bg-white text-zinc-800 shadow-[0_1px_3px_rgb(0,0,0,0.05)]' : 'text-zinc-500 hover:text-zinc-700'}`}
              onClick={() => setMainTab('visual')}
            >
              <span className="flex items-center gap-1.5"><LayoutTemplate size={13} /> 可视化</span>
            </button>
          </div>
          <div className="px-2.5 py-1.5 bg-zinc-50 rounded-md text-[11px] font-mono text-zinc-500 border border-zinc-200/60 max-w-[120px] truncate shadow-sm" title={target ? `<${target.tagName.toLowerCase()}>` : '未选择'}>
            {target ? `<${target.tagName.toLowerCase()}>` : '未选择'}
          </div>
        </div>
        
        {mainTab === 'raw' ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Active Classes</div>
              <div className="flex items-center gap-1.5">
                <button
                  className={`text-[11px] px-2.5 py-1.5 rounded-md transition-all duration-200 ${
                    !target
                      ? 'text-zinc-300 cursor-not-allowed'
                      : 'text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100 border border-transparent'
                  }`}
                  onClick={restore}
                  disabled={!target}
                  title="还原到初始类名"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <RotateCcw size={12} className={!target ? 'text-zinc-300' : 'text-zinc-400'} />
                    还原类名
                  </span>
                </button>
                <button
                  className={`text-[11px] px-2.5 py-1.5 rounded-md transition-all duration-200 ${
                    copyState === 'ok' 
                      ? 'bg-emerald-50 text-emerald-600 font-medium border border-emerald-200/50' 
                      : 'text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100 border border-transparent'
                  }`}
                  onClick={copyClasses}
                  title="复制所有类名"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Copy size={12} className={copyState === 'ok' ? 'text-emerald-500' : 'text-zinc-400'} />
                    {copyState === 'ok' ? '已复制' : '复制类名'}
                  </span>
                </button>
              </div>
            </div>
            <div className="flex flex-wrap content-start gap-2 min-h-[48px] max-h-[160px] overflow-y-auto tw-ve-scrollbar p-2.5 bg-zinc-50/80 rounded-xl border border-zinc-200/60 shadow-inner shadow-zinc-100/50">
              {tokens.length === 0 && (
                <div className="text-xs text-zinc-400 italic py-1 px-1 flex w-full items-center justify-center">暂无类名，在下方输入添加</div>
              )}
              {tokens.map((t, i) => (
                <div key={i} className={`flex items-center gap-1.5 rounded-lg border bg-white pl-1.5 pr-2 py-1 shadow-sm transition-all duration-200 group relative ${t.disabled ? 'border-zinc-200/50 opacity-50 grayscale-[0.5]' : 'border-zinc-200/80 hover:border-zinc-300 hover:shadow'}`}>
                  {editingIdx === i ? (
                    <AutocompleteInput
                      autoFocus
                      value={editingVal}
                      onChange={setEditingVal}
                      onSubmit={(finalVal) => saveEdit(finalVal)}
                      onBlur={() => saveEdit()}
                      className="w-32 text-[11px] font-mono outline-none text-emerald-700 bg-transparent px-1"
                      placeholder="编辑类名"
                    />
                  ) : (
                    <>
                      <input 
                        type="checkbox" 
                        checked={!t.disabled} 
                        onChange={() => toggleTokenDisable(i)}
                        className="w-3 h-3 rounded-[3px] border-zinc-300 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-0 cursor-pointer bg-zinc-50 transition-colors"
                        title={t.disabled ? "启用该类名" : "禁用该类名"}
                      />
                      <button
                        className={`text-[11px] font-mono tracking-tight transition-colors ${t.disabled ? 'text-zinc-400 line-through' : 'text-zinc-700 group-hover:text-emerald-600'}`}
                        onClick={() => startEdit(i)}
                        title="点击编辑该类名"
                      >
                        {t.val}
                      </button>
                    </>
                  )}
                  <div className="w-px h-3.5 bg-zinc-200 mx-0.5"></div>
                  <button
                    className="text-zinc-400 hover:text-red-500 hover:bg-red-50 rounded p-0.5 transition-colors"
                    onClick={() => removeToken(i)}
                    title="删除"
                  >
                    <X size={12} strokeWidth={2.5} />
                  </button>
                </div>
              ))}
            </div>
            
            <div className="pt-2">
              <div className="flex items-center h-[34px] bg-white rounded-lg border border-zinc-200/80 shadow-sm focus-within:ring-2 focus-within:ring-emerald-500/20 focus-within:border-emerald-500 transition-all">
                <div className="flex-1 h-full">
                  <AutocompleteInput
                    value={newVal}
                    onChange={setNewVal}
                    onSubmit={addToken}
                    className="w-full h-full px-3.5 text-[11px] font-mono placeholder:font-sans placeholder:text-zinc-400 focus:outline-none bg-transparent m-0 border-none outline-none ring-0 shadow-none"
                    placeholder="输入新类名 (如 flex, text-center)..."
                  />
                </div>
                <button
                  className="h-full px-4 bg-zinc-800 text-white font-medium hover:bg-zinc-700 transition-colors whitespace-nowrap flex-none active:bg-zinc-900 flex items-center justify-center border-l border-zinc-800 rounded-r-lg"
                  onClick={() => addToken()}
                  title="添加类名 (Enter)"
                >
                  <span className="inline-flex items-center gap-1.5 text-[11px]">
                    <Plus size={14} />
                    添加
                  </span>
                </button>
              </div>
            </div>
            
            <div className="flex items-center justify-between pt-3 border-t border-zinc-100/80 mt-2 sticky bottom-0 bg-white/95 backdrop-blur z-10 -mx-4 px-4 -mb-4 pb-4">
              <div className="text-[10px] text-zinc-400 font-medium">点击类名编辑，实时生效</div>
              <div className="flex items-center gap-1.5">
                <button
                  className="text-[10px] px-2.5 py-1.5 rounded-md bg-white border border-zinc-200/80 text-zinc-600 font-medium hover:bg-zinc-50 hover:border-zinc-300 shadow-sm transition-all duration-200"
                  onClick={() => {
                    if (target) {
                      const arr = Array.from(new Set((target.className || '').trim().split(/\s+/).filter(Boolean)))
                      setTokens(arr.map(val => ({ val, disabled: false })))
                    }
                  }}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <RotateCcw size={12} className="text-zinc-400" />
                    重置为当前DOM类
                  </span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* 内部可视化分类 Tab */}
            <div className="flex items-center gap-2 border-b border-zinc-100/80 pb-3">
              <button 
                className={`px-3.5 py-1.5 rounded-md text-[11px] font-semibold transition-all duration-200 ${visualTab === 'layout' ? 'bg-zinc-800 text-white shadow-sm' : 'bg-zinc-100/80 text-zinc-500 hover:text-zinc-800 hover:bg-zinc-200/80'}`}
                onClick={() => setVisualTab('layout')}
              >
                基础布局
              </button>
              <button 
                className={`px-3.5 py-1.5 rounded-md text-[11px] font-semibold transition-all duration-200 ${visualTab === 'flexbox' ? 'bg-zinc-800 text-white shadow-sm' : 'bg-zinc-100/80 text-zinc-500 hover:text-zinc-800 hover:bg-zinc-200/80'}`}
                onClick={() => setVisualTab('flexbox')}
              >
                Flexbox & Grid
              </button>
            </div>

            {visualTab === 'layout' ? (
              <div className="space-y-5">
                <div className="space-y-2.5">
                  <div className="flex items-center gap-1.5 px-1">
                    <LayoutTemplate size={14} className="text-emerald-500" />
                <div className="text-[11px] font-bold text-zinc-600 uppercase tracking-widest">Display 显示</div>
              </div>
              <div className="grid grid-cols-4 gap-1.5 p-1.5 bg-zinc-50/80 rounded-xl border border-zinc-200/50 shadow-inner shadow-zinc-100/50">
                {['block', 'flex', 'grid', 'inline'].map(d => (
                  <button
                    key={d}
                    className={`px-1.5 py-1.5 rounded-lg text-[10px] font-mono tracking-tight transition-all duration-200 ${
                      currentDisplay === d 
                        ? 'bg-white shadow-sm text-emerald-600 border-zinc-200/80 ring-1 ring-black/[0.03] font-medium' 
                        : 'text-zinc-500 hover:text-zinc-800 hover:bg-zinc-200/60 border-transparent'
                    }`}
                    onClick={() => setClassFromGroup(currentDisplay === d ? null : d, displayGroup)}
                  >
                    {d}
                  </button>
                ))}
                {['inline-block', 'inline-flex', 'inline-grid', 'hidden'].map(d => (
                  <button
                    key={d}
                    className={`px-1.5 py-1.5 rounded-lg text-[10px] font-mono tracking-tight transition-all duration-200 ${
                      currentDisplay === d 
                        ? 'bg-white shadow-sm text-emerald-600 border-zinc-200/80 ring-1 ring-black/[0.03] font-medium' 
                        : 'text-zinc-500 hover:text-zinc-800 hover:bg-zinc-200/60 border-transparent'
                    }`}
                    onClick={() => setClassFromGroup(currentDisplay === d ? null : d, displayGroup)}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>

            <div className="w-full h-px bg-zinc-100/80"></div>

            <div className="space-y-2.5">
              <div className="flex items-center gap-1.5 px-1">
                <Layers size={14} className="text-indigo-500" />
                <div className="text-[11px] font-bold text-zinc-600 uppercase tracking-widest">Visibility 可见性</div>
              </div>
              <div className="flex gap-1.5 p-1.5 bg-zinc-50/80 rounded-xl border border-zinc-200/50 shadow-inner shadow-zinc-100/50">
                {['visible', 'invisible', 'collapse'].map(v => (
                  <button
                    key={v}
                    className={`flex-1 px-2 py-1.5 rounded-lg text-[10px] font-mono tracking-tight transition-all duration-200 ${
                      currentVisibility === v 
                        ? 'bg-white shadow-sm text-indigo-600 border-zinc-200/80 ring-1 ring-black/[0.03] font-medium' 
                        : 'text-zinc-500 hover:text-zinc-800 hover:bg-zinc-200/60 border-transparent'
                    }`}
                    onClick={() => setClassFromGroup(currentVisibility === v ? null : v, visibilityGroup)}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
            
            <div className="text-[10px] text-zinc-400/80 pt-3 text-center border-t border-zinc-100/80 mt-4 font-medium">
                  ✨ 更多可视化配置项即将到来
                </div>
              </div>
            ) : visualTab === 'flexbox' ? (
              <div className="space-y-5">
                <div className="space-y-2.5">
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-1.5">
                  <ArrowRightLeft size={14} className="text-blue-500" />
                  <div className="text-[11px] font-bold text-zinc-600 uppercase tracking-widest">Direction 方向</div>
                </div>
                {/* 快速开启 Flex */}
                {currentDisplay !== 'flex' && currentDisplay !== 'inline-flex' && (
                  <button 
                    onClick={() => setClassFromGroup('flex', displayGroup)}
                    className="text-[10px] font-medium text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200/50 px-2 py-0.5 rounded-md transition-all shadow-sm"
                  >
                    启用 Flex
                  </button>
                )}
              </div>
              <div className="grid grid-cols-4 gap-1.5 p-1.5 bg-zinc-50/80 rounded-xl border border-zinc-200/50 shadow-inner shadow-zinc-100/50">
                {[
                  { v: 'flex-row', i: <ArrowRightLeft size={14} className="mx-auto" />, t: 'row' },
                  { v: 'flex-col', i: <Columns size={14} className="mx-auto rotate-90" />, t: 'col' },
                  { v: 'flex-row-reverse', i: <ArrowRightLeft size={14} className="mx-auto rotate-180" />, t: 'row-rev' },
                  { v: 'flex-col-reverse', i: <Columns size={14} className="mx-auto -rotate-90" />, t: 'col-rev' },
                ].map(({v, i, t}) => (
                  <button
                    key={v}
                    title={v}
                    className={`flex flex-col items-center justify-center gap-1 px-1 py-1.5 rounded-lg text-[10px] font-mono tracking-tight transition-all duration-200 ${
                      currentFlexDirection === v || (v === 'flex-row' && !currentFlexDirection)
                        ? 'bg-white shadow-sm text-blue-600 border-zinc-200/80 ring-1 ring-black/[0.03] font-medium' 
                        : 'text-zinc-500 hover:text-zinc-800 hover:bg-zinc-200/60 border-transparent'
                    }`}
                    onClick={() => setClassFromGroup(currentFlexDirection === v ? null : v, flexDirectionGroup)}
                  >
                    {i}
                    <span>{t}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="w-full h-px bg-zinc-100/80"></div>

            <div className="space-y-2.5">
              <div className="flex items-center gap-1.5 px-1">
                <Rows size={14} className="text-purple-500" />
                <div className="text-[11px] font-bold text-zinc-600 uppercase tracking-widest">Wrap 换行</div>
              </div>
              <div className="flex gap-1.5 p-1.5 bg-zinc-50/80 rounded-xl border border-zinc-200/50 shadow-inner shadow-zinc-100/50">
                {['flex-nowrap', 'flex-wrap', 'flex-wrap-reverse'].map(v => (
                  <button
                    key={v}
                    className={`flex-1 px-2 py-1.5 rounded-lg text-[10px] font-mono tracking-tight transition-all duration-200 ${
                      currentFlexWrap === v || (v === 'flex-nowrap' && !currentFlexWrap)
                        ? 'bg-white shadow-sm text-purple-600 border-zinc-200/80 ring-1 ring-black/[0.03] font-medium' 
                        : 'text-zinc-500 hover:text-zinc-800 hover:bg-zinc-200/60 border-transparent'
                    }`}
                    onClick={() => setClassFromGroup(currentFlexWrap === v ? null : v, flexWrapGroup)}
                  >
                    {v.replace('flex-', '')}
                  </button>
                ))}
              </div>
            </div>

            <div className="w-full h-px bg-zinc-100/80"></div>

            <div className="space-y-2.5">
              <div className="flex items-center gap-1.5 px-1">
                <AlignHorizontalSpaceAround size={14} className="text-orange-500" />
                <div className="text-[11px] font-bold text-zinc-600 uppercase tracking-widest">Justify Content 主轴对齐</div>
              </div>
              <div className="grid grid-cols-4 gap-1.5 p-1.5 bg-zinc-50/80 rounded-xl border border-zinc-200/50 shadow-inner shadow-zinc-100/50">
                {['justify-normal', 'justify-start', 'justify-center', 'justify-end', 'justify-between', 'justify-around', 'justify-evenly', 'justify-stretch'].map(v => (
                  <button
                    key={v}
                    className={`px-1.5 py-1.5 rounded-lg text-[10px] font-mono tracking-tight transition-all duration-200 ${
                      currentJustifyContent === v || (v === 'justify-normal' && !currentJustifyContent)
                        ? 'bg-white shadow-sm text-orange-600 border-zinc-200/80 ring-1 ring-black/[0.03] font-medium' 
                        : 'text-zinc-500 hover:text-zinc-800 hover:bg-zinc-200/60 border-transparent'
                    }`}
                    onClick={() => setClassFromGroup(currentJustifyContent === v ? null : v, justifyContentGroup)}
                  >
                    {v.replace('justify-', '')}
                  </button>
                ))}
              </div>
            </div>

            <div className="w-full h-px bg-zinc-100/80"></div>

            <div className="space-y-2.5">
              <div className="flex items-center gap-1.5 px-1">
                <AlignVerticalSpaceAround size={14} className="text-pink-500" />
                <div className="text-[11px] font-bold text-zinc-600 uppercase tracking-widest">Align Items 交叉轴对齐</div>
              </div>
              <div className="grid grid-cols-3 gap-1.5 p-1.5 bg-zinc-50/80 rounded-xl border border-zinc-200/50 shadow-inner shadow-zinc-100/50">
                {['items-start', 'items-center', 'items-end', 'items-baseline', 'items-stretch'].map(v => (
                  <button
                    key={v}
                    className={`px-1.5 py-1.5 rounded-lg text-[10px] font-mono tracking-tight transition-all duration-200 ${
                      currentAlignItems === v 
                        ? 'bg-white shadow-sm text-pink-600 border-zinc-200/80 ring-1 ring-black/[0.03] font-medium' 
                        : 'text-zinc-500 hover:text-zinc-800 hover:bg-zinc-200/60 border-transparent'
                    }`}
                    onClick={() => setClassFromGroup(currentAlignItems === v ? null : v, alignItemsGroup)}
                  >
                    {v.replace('items-', '')}
                  </button>
                ))}
              </div>
            </div>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
    </>
  )
}

let container = document.getElementById(containerId)
if (!container) {
  container = document.createElement('div')
  container.id = containerId
  const shadowHost = document.createElement('div')
  shadowHost.style.all = 'initial'
  const shadow = shadowHost.attachShadow({ mode: 'open' })
  const style = document.createElement('style')
  style.textContent = `
    :host { all: initial; }
    .reset { all: initial; }
  `
  shadow.appendChild(style)
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = chrome.runtime.getURL('assets/tailwind.css')
  shadow.appendChild(link)
  const mount = document.createElement('div')
  shadow.appendChild(mount)
  container.appendChild(shadowHost)
  document.documentElement.appendChild(container)
  const root = createRoot(mount)
  root.render(<Panel />)
}
