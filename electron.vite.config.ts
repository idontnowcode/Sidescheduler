import { resolve } from 'path'
import { cpSync, mkdirSync } from 'fs'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

/** Rollup plugin: copies src/main/lightnote/*.js → out/main/lightnote/ after each build. */
const copyLightnoteCjs = {
  name: 'copy-lightnote-cjs',
  writeBundle() {
    const src = resolve('src/main/lightnote')
    const dest = resolve('out/main/lightnote')
    mkdirSync(dest, { recursive: true })
    cpSync(src, dest, { recursive: true })
  }
}

export default defineConfig({
  main: {
    // @google/generative-ai stays as a runtime dependency (in node_modules/asar),
    // so lightnote's gemini-service.js can require() it at runtime.
    plugins: [externalizeDepsPlugin(), copyLightnoteCjs]
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/preload/index.ts'),
          lightnote: resolve('src/preload/lightnote.js')
        }
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react()]
  }
})
