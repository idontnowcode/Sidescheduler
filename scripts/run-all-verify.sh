#!/usr/bin/env bash
# 모든 verify-*·e2e-* 시험을 차례로 돌려 한 줄씩 결과를 남긴다(먼저 빌드되어 있어야 한다).
#   bash scripts/run-all-verify.sh [로그파일]
# 결과 줄: "OK   이름  (SUMMARY…)" / "FAIL 이름  (첫 실패·에러)"
cd "$(dirname "$0")/.."
LOG="${1:-screenshots/_all-verify.log}"
: > "$LOG"
for f in scripts/verify-*.mjs scripts/e2e-*.mjs; do
  name=$(basename "$f" .mjs)
  taskkill //F //IM electron.exe >/dev/null 2>&1
  out=$(timeout 300 node "$f" 2>&1)
  code=$?
  summary=$(echo "$out" | grep -E "SUMMARY" | tail -1)
  fails=$(echo "$out" | grep -E "^FAIL|Error:|TimeoutError|exceeded" | head -2 | tr '\n' ' ')
  if [ $code -eq 0 ] && [ -z "$(echo "$out" | grep -E '^FAIL')" ]; then
    echo "OK   $name  ($summary)" >> "$LOG"
  else
    echo "FAIL $name  (code=$code $summary | $fails)" >> "$LOG"
  fi
done
taskkill //F //IM electron.exe >/dev/null 2>&1
echo "DONE" >> "$LOG"
