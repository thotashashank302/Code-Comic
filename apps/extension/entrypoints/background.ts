export default defineBackground(() => {
  chrome.runtime.onMessage.addListener((message, sender) => {
    if (message?.type !== 'comic-code:open-sidepanel' || !sender.tab?.id) {
      return
    }

    void chrome.storage.local.set({
      comicCodeCoordinate: message.coordinate,
    })

    void chrome.sidePanel.open({ tabId: sender.tab.id })
  })

  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
})
