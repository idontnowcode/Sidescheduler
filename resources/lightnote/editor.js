// Editor: Quill init, image handling, auto-save
(function () {
  let quill = null;
  let currentPage = null; // { notebookId, sectionId, pageId }
  let saveTimer = null;
  let isDirty = false;

  const editorHeader = document.getElementById('editor-header');
  const quillWrapper = document.getElementById('quill-wrapper');
  const editorEmpty = document.getElementById('editor-empty');
  const pageTitleInput = document.getElementById('page-title');
  const saveIndicator = document.getElementById('save-indicator');

  // ── Quill init ────────────────────────────────

  function initQuill() {
    quill = new Quill('#quill-editor', {
      theme: 'snow',
      placeholder: '내용을 입력하세요...',
      modules: {
        toolbar: [
          [{ header: [1, 2, 3, false] }],
          ['bold', 'italic', 'underline', 'strike'],
          [{ color: [] }, { background: [] }],
          [{ list: 'ordered' }, { list: 'bullet' }],
          ['blockquote', 'code-block'],
          ['link', 'image'],
          ['clean'],
        ],
      },
    });

    quill.on('text-change', () => {
      if (!currentPage) return;
      isDirty = true;
      setSaveState('수정 중...');
      clearTimeout(saveTimer);
      saveTimer = setTimeout(savePage, 1000);
    });

    // Override default image handler with file picker
    quill.getModule('toolbar').addHandler('image', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = () => {
        if (input.files[0]) insertImageFile(input.files[0]);
      };
      input.click();
    });

    // Paste image
    quill.root.addEventListener('paste', (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) insertImageFile(file);
          break;
        }
      }
    });

    // Drop image
    quill.root.addEventListener('drop', (e) => {
      const files = e.dataTransfer?.files;
      if (!files) return;
      for (const file of files) {
        if (file.type.startsWith('image/')) {
          e.preventDefault();
          insertImageFile(file);
          break;
        }
      }
    });
  }

  // ── Image insertion ───────────────────────────

  async function insertImageFile(file) {
    if (!currentPage) return;
    try {
      // 1. FileReader로 data URL 생성 — Quill에 즉시 표시 (경로 이슈 없음)
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result);
        reader.onerror = () => reject(new Error('FileReader 실패'));
        reader.readAsDataURL(file);
      });

      // 2. Quill에 data URL로 삽입 (저장 후 재로드해도 표시됨)
      const range = quill.getSelection(true);
      quill.insertEmbed(range.index, 'image', dataUrl);
      quill.setSelection(range.index + 1);

      // 3. 파일로도 저장 (향후 내보내기 대비, 백그라운드)
      saveImageFileToDisk(file).catch(e => console.warn('이미지 파일 저장 실패:', e));
    } catch (err) {
      console.error('이미지 삽입 실패:', err);
    }
  }

  async function saveImageFileToDisk(file) {
    if (!currentPage) return;
    // base64 문자열로 변환 (IPC 직렬화 안전)
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    const ext = (file.name || 'image').split('.').pop().replace(/[^a-zA-Z0-9]/g, '') || 'png';
    await window.lightnote.saveImage({ ...currentPage, imageData: btoa(binary), ext });
  }

  // ── Save / Load ───────────────────────────────

  async function savePage() {
    if (!currentPage || !quill) return;
    const delta = quill.getContents();
    const title = pageTitleInput.value.trim() || '제목 없음';
    try {
      setSaveState('저장 중...', 'saving');
      await window.lightnote.savePage({ ...currentPage, delta, title });
      setSaveState('저장됨');
      isDirty = false;
    } catch {
      setSaveState('저장 실패', 'error');
    }
  }

  async function loadPage(notebookId, sectionId, pageId) {
    if (isDirty) await savePage();
    currentPage = { notebookId, sectionId, pageId };
    try {
      const data = await window.lightnote.loadPage(notebookId, sectionId, pageId);
      showEditor();
      pageTitleInput.value = data.title || '제목 없음';
      if (data.delta && data.delta.ops) {
        quill.setContents(data.delta, 'silent');
      } else {
        quill.setContents({ ops: [] }, 'silent');
      }
      // setContents는 선택(커서)을 초기화하지 않으므로 명시적으로 0번으로 리셋
      quill.setSelection(0, 0, 'silent');
      isDirty = false;
      setSaveState('저장됨');
      setTimeout(() => { quill.setSelection(0, 0); quill.focus(); }, 50);
    } catch (err) {
      console.error('Load page failed:', err);
    }
  }

  function showEditor() {
    editorHeader.style.display = 'flex';
    quillWrapper.style.display = 'flex';
    editorEmpty.style.display = 'none';
  }

  function clearEditor() {
    clearTimeout(saveTimer);
    isDirty = false;
    currentPage = null;
    editorHeader.style.display = 'none';
    quillWrapper.style.display = 'none';
    editorEmpty.style.display = 'flex';
    if (quill) quill.setContents({ ops: [] }, 'silent');
    pageTitleInput.value = '';
    setSaveState('저장됨');
    document.getElementById('breadcrumb').textContent = '';
  }

  // ── Title auto-save ───────────────────────────

  let titleTimer = null;
  pageTitleInput.addEventListener('input', () => {
    if (!currentPage) return;
    isDirty = true;
    setSaveState('수정 중...');
    clearTimeout(titleTimer);
    titleTimer = setTimeout(savePage, 1000);
  });

  pageTitleInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (quill) quill.focus();
    }
  });

  // ── Keyboard shortcut: Ctrl+S ─────────────────

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      if (currentPage) savePage();
    }
  });

  // ── Save indicator ────────────────────────────

  function setSaveState(text, cls) {
    saveIndicator.textContent = text;
    saveIndicator.className = 'save-indicator' + (cls ? ' ' + cls : '');
  }

  // ── AI 정리 ──────────────────────────────────

  const btnOrganize = document.getElementById('btn-organize');
  const organizeModal = document.getElementById('organize-modal');
  const organizePreview = document.getElementById('organize-preview');
  const organizeLoading = document.getElementById('organize-loading');
  const btnOrganizeCancel = document.getElementById('btn-organize-cancel');
  const btnOrganizeApply = document.getElementById('btn-organize-apply');

  let organizedText = '';
  let isOrganizing = false;

  btnOrganize.addEventListener('click', async () => {
    if (!currentPage || isOrganizing) return;

    // 내용 없으면 중단
    const text = extractTextFromDelta(quill.getContents());
    if (!text.trim() || text.trim() === '\n') {
      alert('정리할 내용이 없습니다. 먼저 노트를 작성해주세요.');
      return;
    }

    // 현재 페이지를 먼저 저장
    if (isDirty) await savePage();

    // 모달 초기화
    organizedText = '';
    isOrganizing = true;
    organizePreview.innerHTML = '';
    organizeLoading.style.display = 'flex';
    btnOrganizeApply.disabled = true;
    btnOrganize.disabled = true;
    organizeModal.style.display = 'flex';

    const title = pageTitleInput.value.trim() || '제목 없음';
    const result = await window.lightnote.organizePage(title, text);

    if (result?.error === 'NO_API_KEY') {
      closeOrganizeModal();
      window.settingsUI.open();
    }
  });

  // 스트리밍 청크 수신
  window.lightnote.onOrganizeChunk((chunk) => {
    if (chunk.text) {
      organizedText += chunk.text;
      organizePreview.innerHTML = renderOrganizePreview(organizedText);
      organizePreview.scrollTop = organizePreview.scrollHeight;
    }

    if (chunk.done) {
      isOrganizing = false;
      organizeLoading.style.display = 'none';
      btnOrganize.disabled = false;

      if (chunk.error) {
        organizePreview.innerHTML = `<span style="color:var(--danger)">${escapeHtml(chunk.error)}</span>`;
      } else if (organizedText.trim()) {
        btnOrganizeApply.disabled = false;
      }
    }
  });

  btnOrganizeCancel.addEventListener('click', closeOrganizeModal);

  btnOrganizeApply.addEventListener('click', () => {
    if (!organizedText || !currentPage) return;
    // 마크다운 → Quill 델타 변환 후 적용
    const delta = markdownToQuillDelta(organizedText);
    quill.setContents(delta, 'user'); // 'user' 소스 → text-change 발생 → 자동 저장
    closeOrganizeModal();
  });

  // 오버레이 클릭으로 닫기
  organizeModal.addEventListener('click', (e) => {
    if (e.target === organizeModal) closeOrganizeModal();
  });

  function closeOrganizeModal() {
    organizeModal.style.display = 'none';
    organizedText = '';
    isOrganizing = false;
    organizeLoading.style.display = 'none';
    btnOrganize.disabled = false;
    btnOrganizeApply.disabled = true;
  }

  // ── 유틸: Delta → 텍스트 ─────────────────────

  function extractTextFromDelta(delta) {
    return (delta.ops || []).map(op => {
      if (typeof op.insert === 'string') return op.insert;
      if (op.insert?.image) return '[이미지]\n';
      return '';
    }).join('');
  }

  // ── 유틸: 마크다운 → HTML 프리뷰 ────────────

  function renderOrganizePreview(text) {
    const lines = text.split('\n');
    const htmlLines = lines.map(line => {
      const h2 = line.match(/^## (.+)/);
      const h3 = line.match(/^### (.+)/);
      const h1 = line.match(/^# (.+)/);
      const bullet = line.match(/^[-*] (.+)/);

      if (h1)     return `<h2>${inlineMarkdown(escapeHtml(h1[1]))}</h2>`;
      if (h2)     return `<h2>${inlineMarkdown(escapeHtml(h2[1]))}</h2>`;
      if (h3)     return `<h3>${inlineMarkdown(escapeHtml(h3[1]))}</h3>`;
      if (bullet) return `<ul><li>${inlineMarkdown(escapeHtml(bullet[1]))}</li></ul>`;
      if (line.trim() === '') return '<br>';
      return `<p>${inlineMarkdown(escapeHtml(line))}</p>`;
    });
    return htmlLines.join('');
  }

  function inlineMarkdown(html) {
    return html
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>');
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── 유틸: 마크다운 → Quill 델타 ─────────────

  function markdownToQuillDelta(text) {
    const ops = [];
    const lines = text.split('\n');

    for (const line of lines) {
      const h1 = line.match(/^# (.+)/);
      const h2 = line.match(/^## (.+)/);
      const h3 = line.match(/^### (.+)/);
      const bullet = line.match(/^[-*] (.+)/);

      if (h1) {
        pushInlineSegments(ops, h1[1]);
        ops.push({ insert: '\n', attributes: { header: 1 } });
      } else if (h2) {
        pushInlineSegments(ops, h2[1]);
        ops.push({ insert: '\n', attributes: { header: 2 } });
      } else if (h3) {
        pushInlineSegments(ops, h3[1]);
        ops.push({ insert: '\n', attributes: { header: 3 } });
      } else if (bullet) {
        pushInlineSegments(ops, bullet[1]);
        ops.push({ insert: '\n', attributes: { list: 'bullet' } });
      } else {
        pushInlineSegments(ops, line);
        ops.push({ insert: '\n' });
      }
    }

    return { ops };
  }

  function pushInlineSegments(ops, text) {
    const parts = text.split(/(\*\*[^*]+?\*\*|\*[^*]+?\*)/g);
    for (const part of parts) {
      if (!part) continue;
      if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
        ops.push({ insert: part.slice(2, -2), attributes: { bold: true } });
      } else if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
        ops.push({ insert: part.slice(1, -1), attributes: { italic: true } });
      } else {
        ops.push({ insert: part });
      }
    }
  }

  // ── 일정 등록 (AIScheduler 연동) ─────────────
  // 현재 페이지 제목을 AIScheduler 채팅창에 복사할 수 있도록 클립보드에 넣고
  // 안내 토스트를 표시한다. (AIScheduler가 실행 중이 아닐 수 있으므로 안내 방식 사용)

  const btnSchedule = document.getElementById('btn-schedule');
  if (btnSchedule) {
    btnSchedule.addEventListener('click', () => {
      if (!currentPage) return;
      const title = pageTitleInput.value.trim() || '제목 없음';
      const pageId = currentPage.pageId;
      // lightnote://note/[pageId] URL을 클립보드에 복사
      const lightNoteUrl = `lightnote://note/${pageId}`;
      const scheduleText = `"${title}" 일정 등록`;

      // 클립보드에 노트 제목과 URL 복사
      navigator.clipboard.writeText(scheduleText).catch(() => {});

      // 안내 모달 표시
      showScheduleModal(title, pageId, lightNoteUrl);
    });
  }

  function showScheduleModal(title, pageId, lightNoteUrl) {
    const existing = document.getElementById('schedule-modal-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'schedule-modal-overlay';
    overlay.className = 'modal-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:1000';

    overlay.innerHTML = `
      <div class="schedule-modal" style="background:var(--panel-bg);border:1px solid var(--border);border-radius:10px;padding:24px;max-width:400px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,0.4)">
        <h3 style="font-size:15px;font-weight:700;margin-bottom:12px;color:var(--text)">&#128197; AIScheduler 일정 등록</h3>
        <p style="font-size:13px;color:var(--text-2);line-height:1.6;margin-bottom:16px">
          AIScheduler 앱을 열고 채팅창에 아래 내용을 붙여넣으면 일정 등록 시 이 노트가 자동으로 연결됩니다.
        </p>
        <div style="background:var(--input-bg);border:1px solid var(--border);border-radius:6px;padding:10px 12px;margin-bottom:8px">
          <div style="font-size:12px;color:var(--text-3);margin-bottom:4px">제안 텍스트 (AIScheduler 채팅에 입력)</div>
          <div id="schedule-suggest-text" style="font-size:13px;color:var(--text);word-break:break-all">"${escapeHtml(title)}" 일정 등록</div>
        </div>
        <div style="background:var(--input-bg);border:1px solid var(--border);border-radius:6px;padding:10px 12px;margin-bottom:16px">
          <div style="font-size:12px;color:var(--text-3);margin-bottom:4px">노트 링크 (일정에 첨부)</div>
          <div style="font-size:12px;color:var(--accent);word-break:break-all">${escapeHtml(lightNoteUrl)}</div>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button id="btn-schedule-copy-link" style="padding:7px 14px;border-radius:6px;border:1px solid var(--border);background:var(--input-bg);color:var(--text);cursor:pointer;font-size:13px">링크 복사</button>
          <button id="btn-schedule-close" style="padding:7px 14px;border-radius:6px;border:none;background:var(--accent);color:#fff;cursor:pointer;font-size:13px">닫기</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    overlay.querySelector('#btn-schedule-close').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    overlay.querySelector('#btn-schedule-copy-link').addEventListener('click', () => {
      navigator.clipboard.writeText(lightNoteUrl).then(() => {
        const btn = overlay.querySelector('#btn-schedule-copy-link');
        btn.textContent = '복사됨!';
        setTimeout(() => { btn.textContent = '링크 복사'; }, 1500);
      });
    });
  }

  // ── Init ──────────────────────────────────────

  initQuill();

  window.editorUI = {
    loadPage,
    clearEditor,
    savePage,
    getCurrentPage: () => currentPage,
  };
})();
