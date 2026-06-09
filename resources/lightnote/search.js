// AI Assistant 패널: 스트리밍 답변, 인용, 페이지 저장, 웹 검색 토글
(function () {
  const panel = document.getElementById('search-panel');
  const btnToggle = document.getElementById('btn-search-toggle');
  const btnClose = document.getElementById('btn-search-close');
  const input = document.getElementById('search-input');
  const btnSend = document.getElementById('btn-search-send');
  const cbWebSearch = document.getElementById('cb-web-search');
  const resultArea = document.getElementById('search-result-area');
  const resizeHandle = document.getElementById('panel-resize-handle');

  const PANEL_MIN_W = 200;
  const PANEL_MAX_W = 700;
  const STORAGE_KEY = 'lightnote-panel-width';

  let isSearching = false;
  let currentRefs = [];
  let currentWebSources = [];
  let answerEl = null;
  let fullText = '';

  // ── 패널 열기/닫기 ───────────────────────────

  function openPanel() {
    panel.style.display = 'flex';
    resizeHandle.style.display = 'block';
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) panel.style.width = saved;
    input.focus();
  }

  function closePanel() {
    panel.style.display = 'none';
    resizeHandle.style.display = 'none';
  }

  // ── 리사이즈 핸들 ────────────────────────────

  let isResizing = false;
  let resizeStartX = 0;
  let resizeStartW = 0;

  resizeHandle.addEventListener('mousedown', (e) => {
    isResizing = true;
    resizeStartX = e.clientX;
    resizeStartW = panel.offsetWidth;
    resizeHandle.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    // 핸들이 왼쪽에 있고 패널이 오른쪽 → 왼쪽 드래그 시 패널 넓어짐
    const dx = resizeStartX - e.clientX;
    const newW = Math.max(PANEL_MIN_W, Math.min(PANEL_MAX_W, resizeStartW + dx));
    panel.style.width = newW + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (!isResizing) return;
    isResizing = false;
    resizeHandle.classList.remove('dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    localStorage.setItem(STORAGE_KEY, panel.style.width);
  });

  btnToggle.addEventListener('click', () => {
    panel.style.display === 'none' ? openPanel() : closePanel();
  });
  btnClose.addEventListener('click', closePanel);

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault();
      openPanel();
    }
  });

  // ── 전송 ─────────────────────────────────────

  btnSend.addEventListener('click', doSearch);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      doSearch();
    }
  });

  async function doSearch() {
    const question = input.value.trim();
    if (!question || isSearching) return;

    isSearching = true;
    btnSend.disabled = true;
    currentRefs = [];
    currentWebSources = [];
    fullText = '';
    answerEl = null;

    // 결과 영역 초기화
    resultArea.innerHTML = '';
    const loading = document.createElement('div');
    loading.className = 'search-loading';
    const mode = cbWebSearch?.checked ? '웹 검색 중' : '노트 검색 중';
    loading.innerHTML = `${mode} <span class="loading-dots"><span></span><span></span><span></span></span>`;
    resultArea.appendChild(loading);

    const useWebSearch = cbWebSearch?.checked || false;

    try {
      const result = await window.lightnote.search(question, useWebSearch);
      if (result?.error === 'NO_API_KEY') {
        showError('API 키를 먼저 설정해주세요. (⚙ 설정)');
        window.settingsUI.open();
      }
    } catch {
      showError('요청 중 오류가 발생했습니다.');
    }
  }

  // ── 스트리밍 청크 처리 ────────────────────────

  window.lightnote.onSearchChunk((chunk) => {
    if (!answerEl) {
      resultArea.innerHTML = '';
      answerEl = document.createElement('div');
      answerEl.className = 'search-answer';
      resultArea.appendChild(answerEl);
    }

    if (chunk.text) {
      fullText += chunk.text;
      answerEl.innerHTML = renderAnswer(fullText);
    }

    if (chunk.done) {
      isSearching = false;
      btnSend.disabled = false;
      if (answerEl) {
        answerEl.innerHTML = renderAnswer(fullText);
        attachCitationClicks();
      }
      // 답변 완료 후 저장 버튼 표시
      if (fullText && fullText.length > 10) showSaveBtn();
    }
  });

  window.lightnote.onSearchRefs((data) => {
    currentRefs = data.pages || [];
    renderRefs();
  });

  window.lightnote.onSearchWebRefs((data) => {
    currentWebSources = data.sources || [];
    renderWebRefs();
  });

  // ── 답변 렌더링 ───────────────────────────────

  function renderAnswer(text) {
    let html = escapeHtml(text);
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\[(\d+)\]/g, (_, n) =>
      `<sup class="citation" data-ref="${n}">${n}</sup>`
    );
    html = html.replace(/\n/g, '<br>');
    return html;
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function attachCitationClicks() {
    if (!answerEl) return;
    answerEl.querySelectorAll('sup.citation').forEach(sup => {
      sup.addEventListener('click', () => {
        const idx = parseInt(sup.dataset.ref, 10) - 1;
        if (currentRefs[idx]) scrollToRef(idx);
      });
    });
  }

  // ── 웹 출처 렌더링 ────────────────────────────

  function renderWebRefs() {
    if (!currentWebSources.length) return;
    const existing = resultArea.querySelector('.search-web-refs');
    if (existing) existing.remove();

    const refsEl = document.createElement('div');
    refsEl.className = 'search-web-refs';

    const title = document.createElement('div');
    title.className = 'search-refs-title web-refs-title';
    title.innerHTML = '🌐 웹 출처';
    refsEl.appendChild(title);

    currentWebSources.forEach((src, i) => {
      const item = document.createElement('div');
      item.className = 'ref-item web-ref-item';

      const num = document.createElement('div');
      num.className = 'ref-num web-ref-num';
      num.textContent = i + 1;

      const info = document.createElement('div');
      info.className = 'ref-info';

      const titleEl = document.createElement('div');
      titleEl.className = 'ref-path';
      titleEl.textContent = src.title;

      const domainEl = document.createElement('div');
      domainEl.className = 'ref-preview web-ref-domain';
      try {
        domainEl.textContent = new URL(src.url).hostname + ' ↗';
      } catch (_) {
        domainEl.textContent = src.url;
      }

      info.append(titleEl, domainEl);
      item.append(num, info);

      if (src.url) {
        item.addEventListener('click', () => {
          window.lightnote.openExternal(src.url);
        });
      } else {
        item.style.cursor = 'default';
      }

      refsEl.appendChild(item);
    });

    // 노트 출처(.search-refs) 앞 또는 저장 버튼 앞에 삽입
    const noteRefs = resultArea.querySelector('.search-refs');
    const saveBtn = resultArea.querySelector('.save-page-btn');
    if (noteRefs) {
      resultArea.insertBefore(refsEl, noteRefs);
    } else if (saveBtn) {
      resultArea.insertBefore(refsEl, saveBtn);
    } else {
      resultArea.appendChild(refsEl);
    }
  }

  // ── 출처 목록 렌더링 ─────────────────────────

  function renderRefs() {
    if (!currentRefs.length) return;
    const existing = resultArea.querySelector('.search-refs');
    if (existing) existing.remove();

    const refsEl = document.createElement('div');
    refsEl.className = 'search-refs';

    const title = document.createElement('div');
    title.className = 'search-refs-title';
    title.textContent = '노트 출처';
    refsEl.appendChild(title);

    currentRefs.forEach((ref, i) => {
      const item = document.createElement('div');
      item.className = 'ref-item';
      item.dataset.refIdx = i;

      const num = document.createElement('div');
      num.className = 'ref-num';
      num.textContent = i + 1;

      const info = document.createElement('div');
      info.className = 'ref-info';

      const pathEl = document.createElement('div');
      pathEl.className = 'ref-path';
      pathEl.textContent = ref.path || ref.pageName || '알 수 없음';

      const preview = document.createElement('div');
      preview.className = 'ref-preview';
      preview.textContent = (ref.text || '').substring(0, 60).replace(/\n/g, ' ') + '...';

      info.append(pathEl, preview);
      item.append(num, info);

      item.addEventListener('click', () => {
        if (ref.notebookId && ref.sectionId && ref.pageId) {
          window.sidebarUI.onPageSelect(ref.notebookId, ref.sectionId, ref.pageId);
        }
      });

      refsEl.appendChild(item);
    });

    // 저장 버튼 앞에 삽입
    const saveBtn = resultArea.querySelector('.save-page-btn');
    if (saveBtn) {
      resultArea.insertBefore(refsEl, saveBtn);
    } else {
      resultArea.appendChild(refsEl);
    }
  }

  function scrollToRef(idx) {
    const item = resultArea.querySelector(`[data-ref-idx="${idx}"]`);
    if (item) item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function showError(msg) {
    resultArea.innerHTML = `<div class="search-hint">${escapeHtml(msg)}</div>`;
    isSearching = false;
    btnSend.disabled = false;
  }

  // ── 페이지로 저장 ─────────────────────────────

  function showSaveBtn() {
    let btn = resultArea.querySelector('.save-page-btn');
    if (!btn) {
      btn = document.createElement('button');
      btn.className = 'save-page-btn';
      btn.innerHTML = '📄 AI 답변을 페이지로 저장';
      btn.addEventListener('click', saveAsPage);
      resultArea.appendChild(btn);
    }
    btn.style.display = 'flex';
    btn.textContent = '📄 AI 답변을 페이지로 저장';
    btn.disabled = false;
    btn.className = 'save-page-btn';
  }

  async function saveAsPage() {
    if (!fullText) return;

    const btn = resultArea.querySelector('.save-page-btn');
    if (btn) { btn.textContent = '저장 중...'; btn.disabled = true; }

    try {
      // 저장 위치 결정: 현재 열린 페이지 폴더 or AI 답변 노트북
      const cur = window.editorUI?.getCurrentPage?.();
      let targetNbId = cur?.notebookId;
      let targetSecId = cur?.sectionId;

      if (!targetNbId || !targetSecId) {
        // 임시 노트북 "AI 답변" 사용
        const notebooks = await window.lightnote.getNotebooks();
        let aiNb = notebooks.find(n => n.name === 'AI 답변');
        if (!aiNb) aiNb = await window.lightnote.createNotebook('AI 답변', '#da77f2');
        targetNbId = aiNb.id;

        const sections = await window.lightnote.getSections(targetNbId);
        let aiSec = sections[0];
        if (!aiSec) aiSec = await window.lightnote.createSection(targetNbId, '답변 모음');
        targetSecId = aiSec.id;
      }

      // 페이지 제목: 질문 앞부분 사용
      const q = input.value.trim();
      const titleBase = q.length > 40 ? q.substring(0, 40) + '…' : q;
      const title = 'AI: ' + titleBase;

      // 답변을 Quill delta로 변환
      const delta = markdownToDelta(q, fullText);

      const page = await window.lightnote.createPage(targetNbId, targetSecId, title);
      await window.lightnote.savePage({
        notebookId: targetNbId,
        sectionId: targetSecId,
        pageId: page.id,
        delta,
        title,
      });

      // 사이드바 새로고침 후 해당 페이지로 이동
      await window.sidebarUI.load();
      if (window.sidebarUI.onPageSelect) {
        window.sidebarUI.onPageSelect(targetNbId, targetSecId, page.id);
      }

      if (btn) {
        btn.textContent = '✓ 저장 완료';
        btn.className = 'save-page-btn saved';
        btn.disabled = true;
      }
    } catch (err) {
      console.error('페이지 저장 실패:', err);
      if (btn) {
        btn.textContent = '저장 실패 — 다시 시도';
        btn.disabled = false;
      }
    }
  }

  // 마크다운 텍스트 → Quill delta 변환
  function markdownToDelta(question, text) {
    const ops = [];

    // 질문을 h2 제목으로
    if (question) {
      ops.push({ insert: 'Q: ' + question });
      ops.push({ insert: '\n', attributes: { header: 2 } });
    }

    // 답변 본문: **bold** 처리, 나머지는 텍스트
    const lines = text.split('\n');
    for (const line of lines) {
      const segments = line.split(/(\*\*.*?\*\*)/g);
      for (const seg of segments) {
        if (seg.startsWith('**') && seg.endsWith('**') && seg.length > 4) {
          ops.push({ insert: seg.slice(2, -2), attributes: { bold: true } });
        } else if (seg) {
          ops.push({ insert: seg });
        }
      }
      ops.push({ insert: '\n' });
    }

    return { ops };
  }

  window.searchUI = { openPanel, closePanel };
})();
