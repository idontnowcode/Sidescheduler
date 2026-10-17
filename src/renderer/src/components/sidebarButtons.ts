// 사이드바에 놓이는 버튼 목록.
//
// 사이드바와 설정 화면이 **같은 목록**을 본다. 한쪽에만 추가하면 설정에서
// 끌 수 없는 버튼이 생기거나, 없는 버튼의 스위치가 남는다.
//
// 숨김은 "숨긴 것만 적는" 방식이다(`hiddenSidebarButtons`). 그래야 나중에
// 버튼을 추가해도 기본으로 보이고, 예전 설정도 그대로 유효하다.
export const SIDEBAR_BUTTONS = [
  { id: 'quickAdd', label: 'Quick add', desc: '명령 팔레트 (Ctrl+K)' },
  { id: 'dashboard', label: 'Dashboard', desc: '대시보드 창 열기' },
  { id: 'today', label: 'Today', desc: '오늘 날짜로 돌아가기' },
  { id: 'notes', label: 'Notes', desc: 'LightNote 열기' },
  { id: 'journal', label: '기록장', desc: '띄워놓고 채팅하듯 적는 창' },
  { id: 'sticky', label: '스티커 메모', desc: '바탕화면에 붙이는 새 쪽지' },
  { id: 'help', label: 'Help & guide', desc: '도움말' },
] as const

export type SidebarButtonId = (typeof SIDEBAR_BUTTONS)[number]['id']
