import React from 'react'
import { createRoot } from 'react-dom/client'
import { SidePanelShell } from './main'

const root = document.getElementById('root')

if (!root) {
  throw new Error('Missing Comic Code side-panel root')
}

createRoot(root).render(
  <React.StrictMode>
    <SidePanelShell />
  </React.StrictMode>,
)
