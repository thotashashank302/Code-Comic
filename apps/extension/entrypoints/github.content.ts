const reservedRepositorySections = new Set([
  'about',
  'account',
  'apps',
  'codespaces',
  'collections',
  'contact',
  'customer-stories',
  'enterprise',
  'events',
  'explore',
  'features',
  'issues',
  'login',
  'marketplace',
  'new',
  'notifications',
  'orgs',
  'pricing',
  'pulls',
  'search',
  'security',
  'settings',
  'signup',
  'sponsors',
  'topics',
])

function readCoordinate() {
  const segments = window.location.pathname.split('/').filter(Boolean)
  if (segments.length < 2 || reservedRepositorySections.has(segments[0]!)) {
    return null
  }
  const owner = decodeURIComponent(segments[0]!)
  const repository = decodeURIComponent(segments[1]!).replace(/\.git$/i, '')
  if (!owner || !repository) return null

  return { owner, repository }
}

function mountExplainButton() {
  const coordinate = readCoordinate()
  const existing = document.querySelector<HTMLButtonElement>(
    '[data-comic-code-trigger]',
  )

  if (!coordinate) {
    existing?.remove()
    return
  }
  if (existing) return

  const button = document.createElement('button')
  button.type = 'button'
  button.dataset.comicCodeTrigger = 'true'
  button.className = 'Button--primary Button--medium Button'
  button.textContent = 'Explain Repository'
  button.addEventListener('click', () => {
    void chrome.runtime.sendMessage({
      type: 'comic-code:open-sidepanel',
      coordinate,
    })
  })

  const target =
    document.querySelector('[data-testid="repository-overview"]') ??
    document.querySelector('.file-navigation') ??
    document.querySelector('main')
  target?.prepend(button)
}

export default defineContentScript({
  matches: ['https://github.com/*'],
  runAt: 'document_idle',
  main() {
    let currentHref = window.location.href
    let scheduled = false
    const refresh = () => {
      scheduled = false
      if (window.location.href !== currentHref) {
        currentHref = window.location.href
        document.querySelector('[data-comic-code-trigger]')?.remove()
      }
      mountExplainButton()
    }
    const observer = new MutationObserver(() => {
      if (scheduled) return
      scheduled = true
      window.requestAnimationFrame(refresh)
    })

    refresh()
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    })
  },
})
