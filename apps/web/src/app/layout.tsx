import type { Metadata } from 'next'
import type { ReactNode } from 'react'

import './globals.css'
import '@comic-code/ui/styles.css'

export const metadata: Metadata = {
  title: 'Comic Code',
  description:
    'Turn an entire GitHub repository into a grounded visual story anyone can understand.',
  robots: { index: true, follow: true },
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <span
          hidden
          dangerouslySetInnerHTML={{
            __html:
              '<!-- THESIS: Comic Code turns source into a clear 4- or 12-panel story. OWN-WORLD: User-pinned pastel SaaS mosaic, chartreuse, blush, cool blue, peach, black Plus Jakarta Sans. STORY: Inspect real code or explore an explicitly illustrative sample without provider calls. FIRST VIEWPORT: Five unequal rounded panels; functional URL input at the bottom; source and comic windows at the center. FORM: Pinned reference overrides seed 07af16aa. FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance -->',
          }}
        />
        {children}
      </body>
    </html>
  )
}
