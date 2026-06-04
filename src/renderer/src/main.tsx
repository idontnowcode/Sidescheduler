import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'

const root = document.getElementById('root')!
const hash = window.location.hash

if (hash === '#dashboard') {
  import('./dashboard/DashboardApp').then(({ default: DashboardApp }) => {
    ReactDOM.createRoot(root).render(<React.StrictMode><DashboardApp /></React.StrictMode>)
  })
} else if (hash === '#palette') {
  import('./palette/PaletteApp').then(({ default: PaletteApp }) => {
    ReactDOM.createRoot(root).render(<React.StrictMode><PaletteApp /></React.StrictMode>)
  })
} else {
  import('./App').then(({ default: App }) => {
    ReactDOM.createRoot(root).render(<React.StrictMode><App /></React.StrictMode>)
  })
}
