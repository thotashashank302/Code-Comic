const pullRequestPath = /^\/([^/]+)\/([^/]+)\/pull\/(\d+)(?:\/|$)/

function readCoordinate() {
  const match = window.location.pathname.match(pullRequestPath)
  if (!match) return null

  const pullRequestNumber = Number(match[3])
  if (!Number.isSafeInteger(pullRequestNumber) || pullRequestNumber < 1) {
    return null
  }

  return {
    owner: match[1]!,
    repository: match[2]!,
    pullRequestNumber,
  }
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
  button.textContent = 'Explain PR'
  button.addEventListener('click', () => {
    void chrome.runtime.sendMessage({
      type: 'comic-code:open-sidepanel',
      coordinate,
    })
  })

  const target =
    document.querySelector('.gh-header-actions') ??
    document.querySelector('[data-testid="pull-request-header"]') ??
    document.querySelector('main')

  target?.prepend(button)
}

export default defineContentScript({
  matches: ['https://github.com/*'],
  runAt: 'document_idle',
  main() {
    let currentHref = window.location.href
    mountExplainButton()

    const observer = new MutationObserver(() => {
      if (window.location.href !== currentHref) {
        currentHref = window.location.href
      }
      mountExplainButton()
    })

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    })
  },
})
