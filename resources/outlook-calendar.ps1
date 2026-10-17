# 열려 있는 Outlook에서 일정을 읽어 JSON으로 내보낸다. 읽기만 한다.
#
# 왜 COM인가: 회사 PC에서 Microsoft Graph는 테넌트 관리자 승인이 필요하고,
# .ics 내보내기는 사람이 매번 해야 한다. COM은 이미 켜 둔 Outlook에 그대로
# 붙어서 읽으므로 네트워크도 승인도 필요 없다. AI-free.
#
# 반복 일정은 Outlook이 펼쳐 준 **인스턴스 그대로** 가져온다. 규칙을 우리 쪽
# 반복 규칙으로 옮기지 않는 이유는, Outlook 쪽이 훨씬 표현력이 넓고(예: 매월
# 셋째 화요일) 한 회차만 옮기거나 취소한 예외까지 있어서다. 펼쳐진 것을 그대로
# 받으면 그 예외가 저절로 맞는다.
param(
  [int]$DaysBack = 7,
  [int]$DaysAhead = 60,
  [int]$Max = 1000
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Fail($code, $msg) {
  Write-Output (ConvertTo-Json @{ error = $code; message = $msg } -Compress)
  exit 0   # 앱이 JSON으로 읽을 수 있게, 실패도 0으로 끝낸다
}

# Outlook이 떠 있지 않으면 COM이 새로 띄우려다 "연결되지 않은 상태"로 실패한다.
# 그 상태를 에러 문구 대신 분명한 코드로 알린다.
if (-not (Get-Process OUTLOOK -ErrorAction SilentlyContinue)) {
  Fail 'OUTLOOK_NOT_RUNNING' 'Outlook이 실행 중이 아닙니다.'
}

try {
  $ol = New-Object -ComObject Outlook.Application
  $ns = $ol.GetNamespace('MAPI')
  $cal = $ns.GetDefaultFolder(9)   # olFolderCalendar
} catch {
  Fail 'COM_UNAVAILABLE' $_.Exception.Message
}

try {
  $items = $cal.Items
  # 이 둘을 먼저 켜야 반복 일정이 회차별로 펼쳐진다(순서도 반드시 먼저).
  $items.IncludeRecurrences = $true
  $items.Sort('[Start]')

  # Restrict의 날짜 문자열은 **이 PC의 로캘 형식**을 따른다. 고정 형식을 박으면
  # 한국어 환경에서 조용히 0건이 된다.
  $ci = Get-Culture
  $fmt = $ci.DateTimeFormat.ShortDatePattern + ' ' + $ci.DateTimeFormat.ShortTimePattern
  $from = (Get-Date).Date.AddDays(-$DaysBack)
  $to = (Get-Date).Date.AddDays($DaysAhead)
  $filter = "[Start] >= '" + $from.ToString($fmt) + "' AND [Start] < '" + $to.ToString($fmt) + "'"
  $found = $items.Restrict($filter)
} catch {
  Fail 'READ_FAILED' $_.Exception.Message
}

$toMs = { param($d) [long]([DateTimeOffset]::new([datetime]$d).ToUnixTimeMilliseconds()) }

$out = New-Object System.Collections.ArrayList
$n = 0
foreach ($it in $found) {
  if ($n -ge $Max) { break }
  try {
    # 약속(IPM.Appointment)만. 회의 응답 같은 다른 항목이 섞여 들어오면 거른다.
    if ($it.MessageClass -and -not $it.MessageClass.StartsWith('IPM.Appointment')) { continue }
    $body = ''
    if ($it.Body) { $body = $it.Body.Substring(0, [Math]::Min(800, $it.Body.Length)) }
    [void]$out.Add([ordered]@{
      # 같은 회차를 다시 읽을 때 알아보려면 "시리즈 id + 시작시각"이어야 한다.
      # GlobalAppointmentID만 쓰면 반복 일정의 모든 회차가 한 덩어리가 된다.
      uid        = ($it.GlobalAppointmentID + '@' + (& $toMs $it.Start))
      seriesId   = $it.GlobalAppointmentID
      subject    = [string]$it.Subject
      start      = (& $toMs $it.Start)
      end        = (& $toMs $it.End)
      allDay     = [bool]$it.AllDayEvent
      recurring  = [bool]$it.IsRecurring
      location   = [string]$it.Location
      body       = $body
      organizer  = [string]$it.Organizer
    })
    $n++
  } catch {
    continue   # 한 건이 이상해도 나머지는 가져온다
  }
}

Write-Output (ConvertTo-Json @{ ok = $true; count = $out.Count; events = $out } -Depth 4 -Compress)
