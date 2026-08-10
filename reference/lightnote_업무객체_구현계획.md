# LightNote 업무 객체 — 확정 구현계획 (Phase 0 결과)

원본 지시서: [lightnote_업무객체_지시서.md](./lightnote_업무객체_지시서.md)

## Phase 0 조사 결과 (현재 코드 기준)
- **저장**: JSON 파일. `%APPDATA%/lightnote/lightnote-data/` — `notebooks.json`, `sections.json`(parentId 계층), 섹션별 `pages.json`, `pages/<id>.json`=`{id,title,delta,updatedAt}`, `pages/<id>/images/`, `page-refs.json`, `settings.json`.
- **트리**: PARA(내장 붙박이 4) + 사용자 노트북 / 섹션(parentId) / 페이지. CRUD는 `note-storage.js`.
- **AI 게이팅**: 전용 on/off 토글 **없음** — Gemini **API 키 유무**가 곧 on/off. 없으면 `NO_API_KEY`로 막힘(=회사 off 상태). AI 경로: `ipc-handlers.js`의 `lightnote:search / organize-page / extract-actions / brief / apply-actions` → `gemini-service.js`. **신규 기능은 이 경로 무관.**
- **편집기**: Quill 2.0.3 + quill-table-up. 본문은 delta로 저장.
- **플랫폼**: Electron 33 데스크톱(Windows), LightNote는 별도 BrowserWindow.
- **동기화**: 앱 내 동기화 로직 없음(순수 로컬).
- **식별**: 페이지 = **UUID `id`**. 메타데이터는 이 UUID로 연결(이동·이름변경 안전).
- **캘린더 브리지**: LightNote main에 `scheduler.createTask/createEvent/getItem/refresh` 존재(로컬 IPC, AI 무관). 단, **DSP 임베드일 때만** 사용 가능.

## 확정 결정 (사용자 승인)
- **1페이지 = 1업무 객체.**
- **저장 위치**: `lightnote-data/work-objects.json` = `{ [pageId]: {...} }` 단일 파일(본문과 분리).
- **회사/집 각자 독립 사용** (동기화 불필요).
- **완료 이동 대상**: PARA **Archives** (opt-in, 기본 off, 확인 후에만).
- **검색**: 관련부서/문서/결정사항 텍스트도 기존 검색에 포함.
- **AI**: "AI로 채우기"는 자리만, API 키 있을 때만 노출. 실제 호출 미구현.
- **실행 형태**: **DSP 임베드** → 캘린더 연동 활성. (standalone이면 캘린더 버튼 자동 숨김)

## 데이터 모델 (work-objects.json 값)
`status`(예정/진행중/대기/완료/보류, 기본 예정), `priority`(상/중/하), `due`, `start`(없으면 생성일), `updatedAt`(자동), `doneAt`(완료 전환 시 자동, 되돌려도 기본 유지), `nextActions[]`(텍스트+완료+완료일), `decisions[]`(날짜+내용, 최신 위, 삭제는 확인), `depts`, `docs`, `relatedPages[]`(선택), `calendarLink`(등록된 태스크 id, MVP A용).

## 라이프사이클
- 노트 **영구삭제** 시 key 삭제(고아 방지). **휴지통 중엔 유지**(복원 대비). 복제는 새 UUID라 빈 상태.
- 메타데이터 저장/로드 실패 → 본문 정상, 패널만 오류 + 사용자 알림.

## 구현 순서 (각 Phase 후 리뷰 게이트)
1. **Phase 1** — `work-objects.json` 스키마 + main 저장/로드/삭제·휴지통 연동 IPC + preload + 타입
2. **Phase 2** — 노트별 "업무 속성 추가/제거" 토글 + 속성 패널(수동입력, 즉시 저장)
3. **Phase 3** — 자동 로직(D-day·지연 뱃지, 완료일 자동기록, Archives 이동 확인) + **캘린더 연동 A/B/C**
4. **Phase 4** — 업무 목록/대시보드 뷰(표·필터·정렬·요약, 검색 통합, 캘린더 상태 컬럼)

## 캘린더 연동 MVP (Phase 3에 포함, scheduler 있을 때만 노출)
- **A. 기한 → 캘린더 등록**: Due 있으면 "📅 캘린더 등록" → planner 태스크 생성(제목=노트, 기한·우선순위 매핑) + `calendarLink` 저장 + 중복 방지.
- **B. 완료 동기화**: 업무 완료 시 링크된 태스크도 완료 처리 제안.
- **C. 다음 Action → 태스크**: 다음 Action 항목에 날짜 지정 후 태스크 등록·연결, 체크 시 태스크 완료.

## Non-goals
트리/편집기 교체 금지, AI 자동채움 실제 구현 금지, AI 토글 로직 변경 금지, 강제 마이그레이션 금지, 푸시 알림/리마인더 금지, Excel/Word 내보내기 제외.
