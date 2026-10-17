import type { DataDirStatus } from './types'

// 공유 노트 폴더를 지정했는데 못 읽을 때 노트 화면 대신 띄우는 안내.
//
// 그냥 빈 폴더로 열어 버리면 "노트가 전부 사라졌다"로 보이고, 그 상태에서
// 적으면 저쪽 PC의 노트와 갈라진다. 그래서 길을 막고 경로를 보여 준다.
// 되돌릴 수 없는 일은 아무것도 하지 않는다 — 다시 시도하거나 로컬로 돌아가거나.
export default function DataDirBlocked({ problem }: { problem: NonNullable<DataDirStatus['problem']> }) {
  const missing = problem.reason === 'MISSING'
  return (
    <div className="ddb-wrap">
      <div className="ddb-box">
        <div className="ddb-title">공유 노트 폴더를 읽지 못했습니다</div>
        <div className="ddb-path">{problem.path}</div>
        <p className="ddb-body">
          {missing
            ? '폴더가 보이지 않습니다. OneDrive가 아직 로그인 전이거나, 폴더 이름이 바뀌었거나, 다른 PC의 경로일 수 있습니다.'
            : '폴더는 있는데 노트 목록(notebooks.json)이 없습니다. OneDrive가 아직 내려받는 중이거나, 노트 폴더가 아닌 다른 폴더일 수 있습니다.'}
        </p>
        <p className="ddb-note">
          안전을 위해 노트를 열지 않았습니다. 여기서 적으면 다른 PC의 노트와
          갈라지기 때문입니다. 기존 노트는 그대로 있습니다.
        </p>
        <div className="ddb-acts">
          <button className="ddb-btn primary" onClick={() => window.lightnote.dataDirRelaunch()}>
            다시 시도
          </button>
          <button className="ddb-btn" onClick={async () => {
            await window.lightnote.dataDirUseLocal()
            window.lightnote.dataDirRelaunch()
          }}>
            이 PC 폴더로 되돌리기
          </button>
        </div>
        <p className="ddb-hint">
          OneDrive 동기화가 끝난 뒤 [다시 시도]를 누르면 그대로 열립니다.
        </p>
      </div>
    </div>
  )
}
