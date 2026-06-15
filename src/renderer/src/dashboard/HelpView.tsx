interface Item { title: string; body: string; how?: string; keys?: string }

// The app UI is English-only, but this guide is written in Korean for readability.
// UI button/label names and shortcuts are kept in English so they match the screen.
const SECTIONS: { group: string; items: Item[] }[] = [
  {
    group: '기본',
    items: [
      { title: 'Sidebar (사이드바)', body: '화면 가장자리에 상주하는 얇은 바입니다. 마우스를 올리면 오늘 일정·태스크·포커스 타이머가 있는 전체 패널이 펼쳐집니다.', how: '마우스 올리면 펼쳐짐 · 상단 핸들을 끌어 이동 · 자물쇠 아이콘으로 위치 고정.' },
      { title: 'Dashboard (대시보드)', body: '달력·태스크·통계·설정을 상단 탭으로 모아 보는 전체 창입니다.', how: '사이드바의 격자 아이콘, 트레이, 또는 D 키로 엽니다.', keys: 'D' },
      { title: 'Command palette (명령 팔레트)', body: '오늘로 이동, 일정/태스크 추가, 검색을 빠르게 하는 키보드 런처입니다.', how: '어디서나 Ctrl+K.', keys: 'Ctrl+K' },
      { title: 'Quick capture (빠른 입력)', body: '앱이 백그라운드에 있어도, 자연어 한 줄로 태스크·일정을 바로 추가합니다.', how: 'Ctrl+Shift+Space → 예: "team meeting tomorrow 3pm 1h" 입력(시간이 있으면 일정, 날짜만 있으면 태스크) → Enter.', keys: 'Ctrl+Shift+Space' },
    ]
  },
  {
    group: '이벤트 & 태스크',
    items: [
      { title: 'Events (이벤트)', body: '달력에 시간으로 잡히는 항목(회의·약속 등). 색상·장소·반복·알림을 지원합니다.', how: '+ Event 버튼, 사이드바 +, 또는 N 키로 추가.', keys: 'N' },
      { title: 'Tasks (태스크)', body: '마감일·우선순위·프로젝트 태그·하위 체크리스트·예상 시간을 가진 할 일입니다.', how: '+ Task 또는 Shift+N으로 추가. 동그라미를 클릭하면 완료.', keys: 'Shift+N' },
      { title: '미완료 이월 (Roll over)', body: '어제까지 못 끝낸 태스크를 오늘로 모아, 과거에 조용히 쌓이지 않게 합니다.', how: 'Overdue 그룹(사이드바)이나 Today 배너의 "Roll over N to today" 클릭.' },
      { title: '타임블록 (Time-block)', body: '태스크를 달력의 시간 이벤트로 만들어 작업 시간을 확보합니다.', how: '태스크 ⋯ 메뉴 → "Time-block (next hour)". 태스크의 예상 시간을 길이로 사용.' },
      { title: '반복 & 알림', body: '이벤트/태스크는 매일·매주·매월·매년 반복할 수 있고, 시작 전에 알림을 받을 수 있습니다.', how: '이벤트/태스크 편집창에서 Repeat·Reminder 설정.' },
    ]
  },
  {
    group: '집중 & 습관',
    items: [
      { title: 'Focus timer (포커스 타이머)', body: '뽀모도로 방식 타이머로, 태스크에 실제로 쓴 시간을 기록합니다.', how: '사이드바 🎯 Focus에서 태스크 선택 → 길이 선택(15/25/45/60 또는 직접 입력) → Start. 동작 중에는 사이드바 스트립에 표시되며, 클릭하면 일시정지. "Stop & log"를 누르면 경과 시간이 태스크에 저장됩니다.' },
      { title: 'Habits (습관)', body: '매일 루틴을 체크하고 연속일수 🔥를 쌓습니다. 태스크와는 별개입니다.', how: '대시보드 → Habits 탭. 습관을 추가한 뒤 날짜 칸을 클릭해 체크.' },
      { title: 'Insights (통계)', body: '완료율, 기록된 집중 시간, 프로젝트별 집중 시간을 7/14/30일 기준으로 보여줍니다.', how: '대시보드 → Insights 탭. 집중 시간은 포커스 타이머의 "Stop & log"에서 수집됩니다.' },
      { title: '데일리 리추얼', body: 'Today 상단에 아침 "오늘 계획" / 저녁 "리뷰" 안내가 시간대에 따라 표시됩니다.', how: '대시보드 → Today 탭 — 시간대에 따라 자동 표시.' },
    ]
  },
  {
    group: '노트',
    items: [
      { title: 'Notes (LightNote)', body: '리치 노트는 LightNote에 저장되며, 어떤 이벤트·태스크에든 연결할 수 있습니다.', how: '이벤트/태스크 편집창의 Notes 섹션에서 🔗 Link(기존 노트 연결) 또는 + New(새 노트 생성 — 본문에 이벤트/태스크명과 시간/마감이 자동으로 채워져 구분이 쉬움).' },
      { title: '연결 항목 (LINKED)', body: '노트 안의 LINKED 섹션에서 그 노트가 속한 이벤트(날짜·시간)·태스크(마감일)를 볼 수 있습니다.', how: 'LightNote(사이드바 노트 아이콘)를 열고 페이지 하단 LINKED를 펼칩니다.' },
    ]
  },
  {
    group: '캘린더 데이터',
    items: [
      { title: '가져오기 / 내보내기 (.ics)', body: '표준 iCalendar 형식으로 일정을 주고받습니다. 계정 없이 오프라인으로 동작합니다.', how: '대시보드 → Settings → Calendar (.ics) → Import / Export.' },
      { title: '뷰 (Views)', body: '달력은 Today·Day·Week·Month, 주간 회고는 Review, 작업을 포커스 영역으로 묶는 Focus가 있습니다.', how: '탭으로 전환하거나 T(오늘)·D(일)·W(주)·M(월) 키 사용.', keys: 'T / D / W / M' },
    ]
  }
]

export default function HelpView() {
  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-3xl mx-auto space-y-8">
        <div>
          <h2 className="text-lg font-semibold text-ink-800 dark:text-ink-100">도움말 &amp; 가이드</h2>
          <p className="text-sm text-ink-400 mt-1">각 기능의 목적과 사용 방법을 정리했습니다.</p>
        </div>

        {SECTIONS.map((sec) => (
          <div key={sec.group} className="space-y-3">
            <p className="text-xs font-semibold text-ink-500 uppercase tracking-wider">{sec.group}</p>
            <div className="space-y-2">
              {sec.items.map((it) => (
                <div key={it.title} className="rounded-xl border border-ink-100 dark:border-ink-800 p-4">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <h3 className="text-sm font-semibold text-ink-800 dark:text-ink-100">{it.title}</h3>
                    {it.keys && (
                      <kbd className="text-2xs font-mono px-1.5 py-0.5 rounded bg-ink-100 dark:bg-ink-800 text-ink-500 flex-shrink-0">{it.keys}</kbd>
                    )}
                  </div>
                  <p className="text-sm text-ink-600 dark:text-ink-300">{it.body}</p>
                  {it.how && <p className="text-xs text-ink-400 mt-1.5">→ {it.how}</p>}
                </div>
              ))}
            </div>
          </div>
        ))}

        <p className="text-xs text-ink-400 pt-2 border-t border-ink-100 dark:border-ink-800">
          참고: 대부분의 목록은 자동으로 갱신됩니다. 인터페이스 표기는 영어로 통일되어 있습니다.
        </p>
      </div>
    </div>
  )
}
