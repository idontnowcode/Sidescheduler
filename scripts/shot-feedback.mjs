import { _electron as electron } from 'playwright'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const OUT = 'C:/Users/admin/AppData/Local/Temp/claude/C--Users-admin-Desktop-AI-Based-Projects/de0bb0c6-a9eb-4c19-9a71-ad47d9c91bfc/scratchpad'
const tempRoot = mkdtempSync(join(tmpdir(), 'dsp-shotfb-'))
mkdirSync(join(tempRoot, 'lightnote', 'fonts'), { recursive: true })
writeFileSync(join(tempRoot, 'lightnote', 'fonts', 'Nanum Pen Script.ttf'), Buffer.from('dummy'))

const app = await electron.launch({ args: ['out/main/index.js'], env: { ...process.env, DSP_TEST_DATA_DIR: tempRoot, NODE_ENV: 'production' } })
const main = await app.firstWindow()
await main.waitForFunction(() => !!window.electronAPI, null, { timeout: 10000 })
await main.evaluate(() => window.electronAPI.lightnoteOpen())
const ln = await app.waitForEvent('window', { predicate: (w) => w.url().includes('#lightnote'), timeout: 12000 })
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForTimeout(400)
await ln.setViewportSize({ width: 1200, height: 800 })

const ids = await ln.evaluate(async () => {
  const nb = await window.lightnote.createNotebook('NB', '#1971c2')
  const sec = await window.lightnote.createSection(nb.id, 'S', null)
  const pg = await window.lightnote.createPage(nb.id, sec.id, '표 서식 테스트')
  return { nb: nb.id, sec: sec.id, pg: pg.id }
})
await ln.evaluate((ids) => window.lightnote.loadPage(ids.nb, ids.sec, ids.pg), ids)
await ln.reload()
await ln.waitForFunction(() => !!window.lightnote, null, { timeout: 8000 })
await ln.waitForSelector('.ql-editor', { state: 'visible', timeout: 8000 })
await ln.waitForTimeout(500)

// Insert a 2x2 table, fill it, drag-select two cells, apply size 24 + center align.
await ln.locator('.ql-editor').click()
await ln.locator('.ql-table-up .ql-picker-label').click()
await ln.waitForTimeout(200)
await ln.locator('.table-up-select-box__item[data-row="2"][data-col="2"]').click()
await ln.waitForTimeout(400)
const tds = ln.locator('.ql-editor td')
await tds.nth(0).click(); await ln.keyboard.type('매출')
await tds.nth(1).click(); await ln.keyboard.type('120')
await tds.nth(2).click(); await ln.keyboard.type('비용')
await tds.nth(3).click(); await ln.keyboard.type('80')
await ln.waitForTimeout(200)

const a = await tds.nth(0).boundingBox()
const b = await tds.nth(1).boundingBox()
await ln.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
await ln.mouse.down()
await ln.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 10 })
await ln.mouse.up()
await ln.waitForTimeout(250)
await ln.locator('.ql-size .ql-picker-label').click()
await ln.waitForSelector('.ql-size-custom-row', { timeout: 3000 })
await ln.locator('.ql-size-custom-row input').fill('22')
await ln.locator('.ql-size-custom-row button').click()
await ln.waitForTimeout(300)
await ln.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
await ln.mouse.down()
await ln.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 10 })
await ln.mouse.up()
await ln.waitForTimeout(250)
await ln.locator('.ql-align .ql-picker-label').click()
await ln.waitForTimeout(150)
await ln.locator('.ql-align .ql-picker-item[data-value="center"]').click()
await ln.waitForTimeout(400)
await ln.screenshot({ path: `${OUT}/fb-1-table-format.png` })
console.log('saved fb-1-table-format.png')

// Settings: show the align button + custom font.
await ln.locator('.icon-btn[title="Settings"]').click()
await ln.waitForSelector('text=Editor font', { timeout: 5000 })
await ln.waitForTimeout(400)
await ln.screenshot({ path: `${OUT}/fb-2-settings-font.png` })
console.log('saved fb-2-settings-font.png')

await app.close()
