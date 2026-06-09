// App entry point: initialization and wiring
(function () {
  const breadcrumb = document.getElementById('breadcrumb');

  async function init() {
    // Wire page selection callback
    window.sidebarUI.onPageSelect = async (notebookId, sectionId, pageId) => {
      await window.editorUI.loadPage(notebookId, sectionId, pageId);
      await window.sidebarUI.selectPage(notebookId, sectionId, pageId);
      updateBreadcrumb(notebookId, sectionId, pageId);
    };

    // Load sidebar
    await window.sidebarUI.load();

    // Restore last opened page
    try {
      const last = await window.lightnote.getLastOpened();
      if (last && last.notebookId && last.sectionId && last.pageId) {
        await window.sidebarUI.onPageSelect(last.notebookId, last.sectionId, last.pageId);
      }
    } catch { /* no last opened */ }

    // Check API key
    try {
      const { exists } = await window.lightnote.checkApiKey();
      if (!exists) {
        // Show hint after short delay so UI is ready
        setTimeout(() => {
          const hint = document.getElementById('search-hint-text');
          if (hint) hint.textContent = 'AI 검색을 사용하려면 ⚙ 설정에서 Gemini API 키를 입력해주세요.';
        }, 500);
      }
    } catch { /* ignore */ }

    // IPC error handler
    window.lightnote.onError?.((err) => {
      console.error('IPC error:', err);
    });

    // 프로토콜 핸들러 — lightnote://note/[pageId] 로 외부에서 호출 시 해당 노트 열기
    window.lightnote.onOpenPageById?.(async ({ pageId }) => {
      if (!pageId) return;
      try {
        // 전체 노트북·섹션을 순회하여 pageId에 해당하는 노트 찾기
        const notebooks = await window.lightnote.getNotebooks();
        for (const nb of notebooks) {
          const sections = await window.lightnote.getSections(nb.id);
          for (const sec of sections) {
            const pages = await window.lightnote.getPages(nb.id, sec.id);
            const found = pages.find((p) => p.id === pageId);
            if (found) {
              await window.sidebarUI.onPageSelect(nb.id, sec.id, pageId);
              return;
            }
          }
        }
        // 찾지 못한 경우 토스트 안내
        if (window.showToast) window.showToast('해당 노트를 찾을 수 없습니다: ' + pageId, 'error');
      } catch (err) {
        console.error('[open-page-by-id]', err);
      }
    });
  }

  function updateBreadcrumb(notebookId, sectionId, pageId) {
    // We rely on sidebar's internal state for names — read from DOM instead
    const nbEl = document.querySelector(`[data-nb-id="${notebookId}"] .nb-name`);
    const secEl = document.querySelector(`[data-sec-id="${sectionId}"] .sec-name`);
    const pageEl = document.querySelector(`[data-page-id="${pageId}"] .page-name`);
    const parts = [
      nbEl?.textContent,
      secEl?.textContent,
      pageEl?.textContent,
    ].filter(Boolean);
    breadcrumb.textContent = parts.join(' › ');
  }

  init().catch(console.error);
})();
