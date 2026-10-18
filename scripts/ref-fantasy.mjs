// 판타지 테마를 **기준 이미지와 같은 크기로** 찍고 조각끼리 붙여 본다.
//
// 이걸 안 만들어서 매번 눈대중으로 고치다 어긋났다. 테마를 건드릴 때마다
// 이 하나만 돌리면 된다:
//
//   node scripts/ref-fantasy.mjs
//
// 결과: screenshots/themes/fantasy.png (지금)  ·  _ref-compare.png (붙여 본 것)
import { execFileSync } from 'node:child_process'

const REF = 'design/mockups/REFERENCE-fantasy.webp'
const W = 1584, H = 993

// 캡처는 **빌드된** out/ 을 띄운다. 빌드를 빼먹으면 고친 값이 반영되지
// 않은 옛 화면을 찍어 놓고 "안 바뀌었다"고 헤매게 된다 — 한 번 겪었다.
if (!process.env.REF_SKIP_BUILD) {
  console.log('0) 빌드…')
  execFileSync('npx', ['electron-vite', 'build'], { stdio: 'inherit', shell: true })
}

console.log('1) 기준과 같은 크기로 찍는다…')
execFileSync(process.execPath, ['scripts/shot-themes.mjs'], {
  stdio: 'inherit', env: { ...process.env, SHOT_W: String(W), SHOT_H: String(H), ONLY_THEME: process.env.ONLY_THEME || 'fantasy' },
})

console.log('2) 조각끼리 붙인다…')
execFileSync('npx', ['electron', 'design/theme-assets/compare.js',
  `${process.cwd()}/${REF}`,
  `${process.cwd()}/screenshots/themes/fantasy.png`,
  `${process.cwd()}/screenshots/themes/_ref-compare.png`, String(W)],
{ stdio: 'inherit', shell: true })

console.log('\n기준: ' + REF)
console.log('지금: screenshots/themes/fantasy.png')
console.log('대조: screenshots/themes/_ref-compare.png')
