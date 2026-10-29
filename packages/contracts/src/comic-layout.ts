export type PanelCount = 4 | 12

export const comicPanelWidth = 800
export const comicPanelHeight = 585
export const comicFooterHeight = 30

export function comicDimensions(panelCount: number) {
  if (panelCount !== 4 && panelCount !== 12)
    throw new Error('invalid_panel_count')
  return {
    width: comicPanelWidth * 2,
    height: comicPanelHeight * (panelCount / 2) + comicFooterHeight,
  }
}
