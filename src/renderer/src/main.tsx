import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'

const root = document.getElementById('root')!

// Hash-based routing: #dashboard → DashboardApp, else → Sidebar App
if (window.location.hash === '#dashboard') {
  import('./dashboard/DashboardApp').then(({ default: DashboardApp }) => {
    ReactDOM.createRoot(root).render(
      <React.StrictMode><DashboardApp /></React.StrictMode>
    )
  })
} else {
  import('./App').then(({ default: App }) => {
    ReactDOM.createRoot(root).render(
      <React.StrictMode><App /></React.StrictMode>
    )
  })
}
