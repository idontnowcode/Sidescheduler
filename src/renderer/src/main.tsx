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
} else if (hash === '#editor') {
  import('./editor/EditorApp').then(({ default: EditorApp }) => {
    ReactDOM.createRoot(root).render(<React.StrictMode><EditorApp /></React.StrictMode>)
  })
} else if (hash === '#note') {
  import('./note/NoteEditorApp').then(({ default: NoteEditorApp }) => {
    ReactDOM.createRoot(root).render(<React.StrictMode><NoteEditorApp /></React.StrictMode>)
  })
} else if (hash === '#lightnote') {
  import('./lightnote/LightnoteApp').then(({ default: LightnoteApp }) => {
    ReactDOM.createRoot(root).render(<React.StrictMode><LightnoteApp /></React.StrictMode>)
  })
} else {
  import('./App').then(({ default: App }) => {
    ReactDOM.createRoot(root).render(<React.StrictMode><App /></React.StrictMode>)
  })
}
