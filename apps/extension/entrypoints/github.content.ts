import { parseGitHubRepositoryUrl } from '@comic-code/contracts/repository-url'

function readCoordinate() {
  return parseGitHubRepositoryUrl(window.location.href)
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
