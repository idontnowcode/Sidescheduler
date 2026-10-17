// Quill 델타를 "줄" 단위로 다루는 공용 도구.
//
// 델타는 줄 개념이 없다. 글자 뭉치(op)들이 이어져 있고 줄은 그 안의 \n 으로만
// 갈린다. 그래서 "셋째 줄의 체크를 바꾼다" 같은 일을 하려면 매번 같은 분해를
// 손으로 짜게 되는데, 그러다 틀리면 글이 통째로 어긋난다.
//
// 중요한 약속: **줄의 속성(목록·헤더 등)은 그 줄을 끝내는 \n op에 붙는다.**
// 그래서 체크박스는 글자가 아니라 줄 끝 newline의 attributes.list 에 있다.
//
// 같은 분해가 journal.js(deltaToLines)와 main/index.ts(splitOpLines)에도
// 있다. 그쪽은 들고 나오는 값이 달라 당장 합치지 않았다 — 손볼 일이 생기면
// 여기로 모으는 게 맞다.

/** 델타 → 줄 배열. 각 줄은 자기 op들과 줄 끝 속성(nl)을 그대로 쥐고 있다. */
function splitOpLines(delta) {
  const lines = [];
  let cur = { ops: [], nl: null };
  for (const op of (delta && delta.ops) || []) {
    const ins = op.insert;
    if (typeof ins === 'string') {
      const parts = ins.split('\n');
      for (let i = 0; i < parts.length; i++) {
        if (parts[i]) {
          cur.ops.push(op.attributes ? { insert: parts[i], attributes: op.attributes } : { insert: parts[i] });
        }
        if (i < parts.length - 1) {
          cur.nl = op.attributes || null;
          lines.push(cur);
          cur = { ops: [], nl: null };
        }
      }
    } else {
      cur.ops.push(op);   // 사진 같은 끼워 넣은 것
    }
  }
  if (cur.ops.length) lines.push(cur);
  return lines;
}

/** 줄 배열 → 델타. splitOpLines 의 반대. */
function joinOpLines(lines) {
  const ops = [];
  for (const ln of lines) {
    ops.push(...ln.ops);
    ops.push(ln.nl ? { insert: '\n', attributes: ln.nl } : { insert: '\n' });
  }
  return { ops };
}

/** 그 줄의 글자만. */
function lineText(line) {
  return (line.ops || [])
    .filter((o) => typeof o.insert === 'string')
    .map((o) => o.insert)
    .join('');
}

module.exports = { splitOpLines, joinOpLines, lineText };
