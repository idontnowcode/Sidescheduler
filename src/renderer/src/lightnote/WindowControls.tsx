import { useEffect, useState } from 'react'

// 창 조작 단추(최소화·최대화·닫기). 예전엔 운영체제가 헤더 위에 그렸는데,
// 그러면 단추 오른쪽에 아무것도 놓을 수 없다(판타지 테마는 맨 귀퉁이에 보석
// 장식이 온다). 그래서 앱이 직접 그린다. 테마는 --titlebar-ink 로 기호 색을,
// --wingem-* 로 귀퉁이 장식을 정한다.
export default function WindowControls() {
  const [max, setMax] = useState(false)
  useEffect(() => {
    window.lightnote.winIsMaximized?.().then(setMax).catch(() => {})
    return window.lightnote.onWinState?.((s) => setMax(!!s.maximized))
  }, [])
  const act = (a: 'minimize' | 'maximize' | 'close') => window.lightnote.winControl?.(a)
  return (
    <>
    <div className="header-winpad win-ctrls">
      <button className="win-btn" data-glyph="min" title="최소화" aria-label="최소화" onClick={() => act('minimize')}>
        <svg width="10" height="10" viewBox="0 0 10 10"><path d="M0 5.5h10" stroke="currentColor" strokeWidth="1" /></svg>
      </button>
      <button className="win-btn" data-glyph={max ? 'restore' : 'max'} title={max ? '이전 크기로' : '최대화'} aria-label={max ? '이전 크기로' : '최대화'}
        onClick={() => act('maximize')}>
        {max
          ? <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
              <path d="M2.5 2.5V.5h7v7h-2" /><rect x=".5" y="2.5" width="7" height="7" /></svg>
          : <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
              <rect x=".5" y=".5" width="9" height="9" /></svg>}
      </button>
      <button className="win-btn win-close" data-glyph="close" title="닫기" aria-label="닫기" onClick={() => act('close')}>
        <svg width="10" height="10" viewBox="0 0 10 10"><path d="M0 0l10 10M10 0 0 10" stroke="currentColor" strokeWidth="1" /></svg>
      </button>
    </div>
    <span className="win-gem" aria-hidden="true" />
    </>
  )
}
