// Sidebar: notebook tree rendering and CRUD (with nested sections)
(function () {
  const tree = document.getElementById('notebook-tree');
  const btnNewNb = document.getElementById('btn-new-notebook');
  const ctxMenu = document.getElementById('context-menu');
  const ctxRename = document.getElementById('ctx-rename');
  const ctxDelete = document.getElementById('ctx-delete');
  const ctxAddSubsection = document.getElementById('ctx-add-subsection');
  const ctxAddChild = document.getElementById('ctx-add-child');

  // State
  let notebooks = [];
  let expandedNbs = new Set();
  let expandedSecs = new Set();
  let selected = { notebookId: null, sectionId: null, pageId: null };
  let ctxTarget = null; // { type, notebookId, sectionId?, pageId? }

  const COLORS = ['#4dabf7', '#69db7c', '#ffa94d', '#da77f2', '#f783ac', '#a9e34b', '#66d9e8', '#ffd43b'];

  // ── Public API ────────────────────────────────

  async function load() {
    notebooks = await window.lightnote.getNotebooks();
    await renderAll();
  }

  function getSelected() { return { ...selected }; }

  async function selectPage(notebookId, sectionId, pageId) {
    selected = { notebookId, sectionId, pageId };
    expandedNbs.add(notebookId);

    // Load all sections and find ancestor chain to expand
    const allSections = await window.lightnote.getSections(notebookId);
    const secMap = {};
    allSections.forEach(s => { secMap[s.id] = s; });

    let cur = secMap[sectionId];
    while (cur) {
      expandedSecs.add(cur.id);
      cur = cur.parentId ? secMap[cur.parentId] : null;
    }

    notebooks = await window.lightnote.getNotebooks();
    await renderAll();
  }

  // ── Tree building helpers ─────────────────────

  /**
   * Convert flat section list to tree (each node gets .children array).
   * Orphaned parentId references fall back to root.
   */
  function buildSectionTree(sections) {
    const map = {};
    sections.forEach(s => { map[s.id] = { ...s, children: [] }; });
    const roots = [];
    sections.forEach(s => {
      if (s.parentId && map[s.parentId]) {
        map[s.parentId].children.push(map[s.id]);
      } else {
        roots.push(map[s.id]);
      }
    });
    return roots;
  }

  // ── Rendering ─────────────────────────────────

  async function renderAll() {
    if (notebooks.length === 0) {
      tree.innerHTML = '<div class="empty-hint">노트북이 없습니다.<br>+ 버튼으로 만들어보세요.</div>';
      return;
    }
    tree.innerHTML = '';
    for (const nb of notebooks) {
      const nbEl = buildNbEl(nb);
      tree.appendChild(nbEl);
      if (expandedNbs.has(nb.id)) {
        const secList = nbEl.querySelector('.nb-sections');
        await fillSections(nb.id, secList);
      }
    }
    renderHighlight();
  }

  function renderHighlight() {
    tree.querySelectorAll('.nb-header, .sec-header, .page-item').forEach(el => el.classList.remove('selected'));
    if (selected.pageId) {
      const el = tree.querySelector(`[data-page-id="${selected.pageId}"]`);
      if (el) el.classList.add('selected');
    } else if (selected.sectionId) {
      const el = tree.querySelector(`[data-sec-id="${selected.sectionId}"]`);
      if (el) el.classList.add('selected');
    } else if (selected.notebookId) {
      const el = tree.querySelector(`[data-nb-id="${selected.notebookId}"]`);
      if (el) el.classList.add('selected');
    }
  }

  // ── Notebook element ──────────────────────────

  function buildNbEl(nb) {
    const wrap = document.createElement('div');
    wrap.className = 'nb-item';

    const header = document.createElement('div');
    header.className = 'nb-header';
    header.dataset.nbId = nb.id;

    const arrow = document.createElement('span');
    arrow.className = 'nb-arrow' + (expandedNbs.has(nb.id) ? ' open' : '');
    arrow.textContent = '▶';

    const dot = document.createElement('span');
    dot.className = 'nb-color';
    dot.style.background = nb.color || COLORS[0];

    const name = document.createElement('span');
    name.className = 'nb-name';
    name.textContent = nb.name;

    const addBtn = document.createElement('button');
    addBtn.className = 'icon-btn-sm nb-add-btn';
    addBtn.title = '섹션 추가';
    addBtn.textContent = '+';
    addBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openInputModal('섹션 이름 입력', '', async (val) => {
        await window.lightnote.createSection(nb.id, val, null);
        expandedNbs.add(nb.id);
        await load();
      });
    });

    header.append(arrow, dot, name, addBtn);

    const secList = document.createElement('div');
    secList.className = 'nb-sections' + (expandedNbs.has(nb.id) ? ' open' : '');

    header.addEventListener('click', async () => {
      const isOpen = expandedNbs.has(nb.id);
      if (isOpen) {
        expandedNbs.delete(nb.id);
        secList.classList.remove('open');
        arrow.classList.remove('open');
      } else {
        expandedNbs.add(nb.id);
        secList.classList.add('open');
        arrow.classList.add('open');
        if (secList.children.length === 0) {
          await fillSections(nb.id, secList);
        }
      }
    });

    header.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      ctxTarget = { type: 'notebook', notebookId: nb.id };
      ctxAddSubsection.style.display = 'none';
      ctxAddChild.style.display = 'flex';
      ctxAddChild.textContent = '섹션 추가';
      showCtx(e.clientX, e.clientY);
    });

    wrap.append(header, secList);
    return wrap;
  }

  // ── Section loading / filling ─────────────────

  async function fillSections(nbId, container) {
    const sections = await window.lightnote.getSections(nbId);
    container.innerHTML = '';
    const sectionTree = buildSectionTree(sections);
    for (const sec of sectionTree) {
      const secEl = buildSecEl(nbId, sec);
      container.appendChild(secEl);
      if (expandedSecs.has(sec.id)) {
        const childrenContainer = secEl.querySelector('.sec-children');
        await fillSecExpanded(nbId, sec, childrenContainer);
      }
    }
  }

  /**
   * Fill an already-expanded section's children container.
   * Renders sub-sections first, then pages, then recurses.
   */
  async function fillSecExpanded(nbId, sec, container) {
    container.innerHTML = '';
    for (const child of (sec.children || [])) {
      const childEl = buildSecEl(nbId, child);
      container.appendChild(childEl);
      if (expandedSecs.has(child.id)) {
        const grandchildContainer = childEl.querySelector('.sec-children');
        await fillSecExpanded(nbId, child, grandchildContainer);
      }
    }
    await fillPages(nbId, sec.id, container);
  }

  // ── Section element ───────────────────────────

  function buildSecEl(nbId, sec) {
    // sec.children is set by buildSectionTree
    const children = sec.children || [];
    const hasSubSections = children.length > 0;

    const wrap = document.createElement('div');
    wrap.className = 'sec-item';

    const header = document.createElement('div');
    header.className = 'sec-header';
    header.dataset.secId = sec.id;

    const arrow = document.createElement('span');
    arrow.className = 'sec-arrow' + (expandedSecs.has(sec.id) ? ' open' : '');
    arrow.textContent = '▶';

    const icon = document.createElement('span');
    icon.className = 'sec-icon';
    icon.textContent = hasSubSections ? '📁' : '📂';

    const name = document.createElement('span');
    name.className = 'sec-name';
    name.textContent = sec.name;

    const addBtn = document.createElement('button');
    addBtn.className = 'icon-btn-sm sec-add-btn';
    addBtn.title = '페이지 추가';
    addBtn.textContent = '+';
    addBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openInputModal('페이지 제목 입력', '', async (val) => {
        const page = await window.lightnote.createPage(nbId, sec.id, val || '제목 없음');
        expandedSecs.add(sec.id);
        await load();
        window.sidebarUI.onPageSelect(nbId, sec.id, page.id);
      });
    });

    header.append(arrow, icon, name, addBtn);

    const childrenContainer = document.createElement('div');
    childrenContainer.className = 'sec-children' + (expandedSecs.has(sec.id) ? ' open' : '');

    header.addEventListener('click', async () => {
      const isOpen = expandedSecs.has(sec.id);
      if (isOpen) {
        expandedSecs.delete(sec.id);
        childrenContainer.classList.remove('open');
        arrow.classList.remove('open');
      } else {
        expandedSecs.add(sec.id);
        childrenContainer.classList.add('open');
        arrow.classList.add('open');
        if (childrenContainer.children.length === 0) {
          await fillSecExpanded(nbId, sec, childrenContainer);
        }
      }
    });

    header.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      ctxTarget = { type: 'section', notebookId: nbId, sectionId: sec.id };
      ctxAddSubsection.style.display = 'flex';
      ctxAddChild.style.display = 'flex';
      ctxAddChild.textContent = '📄 페이지 추가';
      showCtx(e.clientX, e.clientY);
    });

    wrap.append(header, childrenContainer);
    return wrap;
  }

  // ── Page loading / element ────────────────────

  async function fillPages(nbId, secId, container) {
    const pages = await window.lightnote.getPages(nbId, secId);
    for (const page of pages) {
      container.appendChild(buildPageEl(nbId, secId, page));
    }
  }

  function buildPageEl(nbId, secId, page) {
    const el = document.createElement('div');
    el.className = 'page-item' + (selected.pageId === page.id ? ' selected' : '');
    el.dataset.pageId = page.id;

    const icon = document.createElement('span');
    icon.className = 'page-icon';
    icon.textContent = '📄';

    const name = document.createElement('span');
    name.className = 'page-name';
    name.textContent = page.title;

    el.append(icon, name);

    el.addEventListener('click', () => {
      window.sidebarUI.onPageSelect(nbId, secId, page.id);
    });

    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      ctxTarget = { type: 'page', notebookId: nbId, sectionId: secId, pageId: page.id };
      ctxAddSubsection.style.display = 'none';
      ctxAddChild.style.display = 'none';
      showCtx(e.clientX, e.clientY);
    });

    return el;
  }

  // ── Context menu ──────────────────────────────

  function showCtx(x, y) {
    ctxMenu.style.display = 'block';
    ctxMenu.style.left = x + 'px';
    ctxMenu.style.top = y + 'px';
    const rect = ctxMenu.getBoundingClientRect();
    if (rect.right > window.innerWidth) ctxMenu.style.left = (x - rect.width) + 'px';
    if (rect.bottom > window.innerHeight) ctxMenu.style.top = (y - rect.height) + 'px';
  }

  function hideCtx() { ctxMenu.style.display = 'none'; }

  document.addEventListener('click', hideCtx);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideCtx(); });

  ctxRename.addEventListener('click', async () => {
    hideCtx();
    if (!ctxTarget) return;
    const { type, notebookId, sectionId, pageId } = ctxTarget;
    if (type === 'notebook') {
      const nb = notebooks.find(n => n.id === notebookId);
      openInputModal('노트북 이름 변경', nb?.name || '', async (val) => {
        await window.lightnote.renameNotebook(notebookId, val);
        await load();
      });
    } else if (type === 'section') {
      openInputModal('폴더 이름 변경', '', async (val) => {
        await window.lightnote.renameSection(notebookId, sectionId, val);
        await load();
      });
    } else if (type === 'page') {
      openInputModal('페이지 이름 변경', '', async (val) => {
        await window.lightnote.renamePage(notebookId, sectionId, pageId, val);
        await load();
        if (selected.pageId === pageId) {
          document.getElementById('page-title').value = val;
        }
      });
    }
  });

  ctxDelete.addEventListener('click', async () => {
    hideCtx();
    if (!ctxTarget) return;
    const { type, notebookId, sectionId, pageId } = ctxTarget;
    if (type === 'notebook') {
      await window.lightnote.deleteNotebook(notebookId);
      if (selected.notebookId === notebookId) window.editorUI.clearEditor();
    } else if (type === 'section') {
      await window.lightnote.deleteSection(notebookId, sectionId);
      if (selected.sectionId === sectionId) window.editorUI.clearEditor();
    } else if (type === 'page') {
      await window.lightnote.deletePage(notebookId, sectionId, pageId);
      if (selected.pageId === pageId) window.editorUI.clearEditor();
    }
    await load();
  });

  // Sub-folder creation (context menu)
  ctxAddSubsection.addEventListener('click', async () => {
    hideCtx();
    if (!ctxTarget) return;
    const { type, notebookId, sectionId } = ctxTarget;
    if (type === 'section') {
      openInputModal('하위 폴더 이름 입력', '', async (val) => {
        await window.lightnote.createSection(notebookId, val, sectionId);
        expandedSecs.add(sectionId);
        await load();
      });
    }
  });

  // Page / top-level section creation (context menu)
  ctxAddChild.addEventListener('click', async () => {
    hideCtx();
    if (!ctxTarget) return;
    const { type, notebookId, sectionId } = ctxTarget;
    if (type === 'notebook') {
      openInputModal('섹션 이름 입력', '', async (val) => {
        await window.lightnote.createSection(notebookId, val, null);
        expandedNbs.add(notebookId);
        await load();
      });
    } else if (type === 'section') {
      openInputModal('페이지 제목 입력', '', async (val) => {
        const page = await window.lightnote.createPage(notebookId, sectionId, val || '제목 없음');
        expandedSecs.add(sectionId);
        await load();
        window.sidebarUI.onPageSelect(notebookId, sectionId, page.id);
      });
    }
  });

  // ── New notebook button ───────────────────────

  btnNewNb.addEventListener('click', () => {
    openInputModal('새 노트북 이름 입력', '', async (val) => {
      const color = COLORS[notebooks.length % COLORS.length];
      await window.lightnote.createNotebook(val, color);
      await load();
    });
  });

  // ── Inline input modal ────────────────────────

  function openInputModal(title, defaultVal, onConfirm) {
    const overlay = document.getElementById('input-modal');
    const titleEl = document.getElementById('input-modal-title');
    const field = document.getElementById('input-modal-field');
    const btnOk = document.getElementById('input-modal-ok');
    const btnCancel = document.getElementById('input-modal-cancel');

    titleEl.textContent = title;
    field.value = defaultVal || '';
    overlay.style.display = 'flex';
    setTimeout(() => { field.focus(); field.select(); }, 50);

    function confirm() {
      const val = field.value.trim();
      if (!val) return;
      overlay.style.display = 'none';
      cleanup();
      onConfirm(val);
    }

    function cancel() {
      overlay.style.display = 'none';
      cleanup();
    }

    function onKey(e) {
      if (e.key === 'Enter') confirm();
      if (e.key === 'Escape') cancel();
    }

    function cleanup() {
      btnOk.removeEventListener('click', confirm);
      btnCancel.removeEventListener('click', cancel);
      field.removeEventListener('keydown', onKey);
      overlay.removeEventListener('click', onOverlayClick);
    }

    function onOverlayClick(e) { if (e.target === overlay) cancel(); }

    btnOk.addEventListener('click', confirm);
    btnCancel.addEventListener('click', cancel);
    field.addEventListener('keydown', onKey);
    overlay.addEventListener('click', onOverlayClick);
  }

  // ── Public ────────────────────────────────────

  window.sidebarUI = {
    load,
    getSelected,
    selectPage,
    openInputModal,
    onPageSelect: null, // set by app.js
  };
})();
