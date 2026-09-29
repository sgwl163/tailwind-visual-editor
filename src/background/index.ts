chrome.runtime.onInstalled.addListener(() => {
  console.log('Tailwind 可视化编辑器已安装')
  ensureContentOnAllTabs()
})

// content script 构建产物路径（由 build-content.mjs 生成到 dist/assets）
const contentFiles = ['assets/content.js']

function isInjectableUrl(url?: string) {
  if (!url) return false
  // 这些页面不允许注入脚本
  const blocked = ['chrome://', 'edge://', 'chrome-extension://', 'about:']
  return !blocked.some(p => url.startsWith(p))
}

// 注入 content script（重复注入不会重复挂载 UI，但能保证“已打开页面”具备监听能力）
function injectContent(tabId: number, cb?: () => void) {
  chrome.scripting.executeScript({ target: { tabId }, files: contentFiles }, () => cb?.())
}

// 全局设置变化时，给所有可注入页面补注入 content script，用于同步开关状态
function ensureContentOnAllTabs() {
  chrome.tabs.query({}, tabs => {
    for (const tab of tabs) {
      const tabId = tab?.id
      if (!tabId) continue
      if (!isInjectableUrl(tab.url)) continue
      injectContent(tabId)
    }
  })
}

function toggleTab(tabId: number) {
  // 先注入再发消息，避免页面未注入导致消息丢失
  injectContent(tabId, () => chrome.tabs.sendMessage(tabId, { type: 'TW_TOGGLE' }))
}

function toggleActiveTab() {
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    const tab = tabs[0]
    if (tab && tab.id) {
      toggleTab(tab.id)
    }
  })
}

chrome.runtime.onMessage.addListener((msg, _sender, _sendResponse) => {
  if (msg?.type === 'TW_TOGGLE_ACTIVE') {
    toggleActiveTab()
  }
})

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return
  // 任意页面修改全局开关时，这里触发全标签页同步
  if (changes.tw_ve_global_enabled || changes.tw_ve_inspect_enabled) {
    ensureContentOnAllTabs()
  }
})
