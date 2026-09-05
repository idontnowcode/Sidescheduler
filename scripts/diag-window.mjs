// Diagnostic: launch the REAL production build (real userData, no test isolation),
// report every window's actual bounds/visibility from Electron's own screen
// coordinate system, and LEAVE THE APP RUNNING (no app.close()).
import { _electron as electron } from 'playwright'

const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, NODE_ENV: 'production' } })
await new Promise(r => setTimeout(r, 1500))

const info = await app.evaluate(({ BrowserWindow, screen }) => ({
  displays: screen.getAllDisplays().map(d => ({ id: d.id, bounds: d.bounds, workArea: d.workArea, scaleFactor: d.scaleFactor })),
  primary: screen.getPrimaryDisplay().id,
  windows: BrowserWindow.getAllWindows().map(w => ({
    title: w.getTitle(),
    bounds: w.getBounds(),
    isVisible: w.isVisible(),
    isDestroyed: w.isDestroyed(),
    isMinimized: w.isMinimized(),
    opacity: w.getOpacity(),
  })),
}))
console.log(JSON.stringify(info, null, 2))
// Detach — do NOT close the app, leave it running for the user.
process.exit(0)
