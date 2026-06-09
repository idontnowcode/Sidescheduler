// Settings modal: API key management + theme & accent settings
(function () {
  const modal = document.getElementById('settings-modal');
  const btnOpen = document.getElementById('btn-settings');
  const btnCancel = document.getElementById('btn-settings-cancel');
  const btnSave = document.getElementById('btn-save-key');
  const btnTest = document.getElementById('btn-test-key');
  const btnToggle = document.getElementById('btn-toggle-key');
  const keyInput = document.getElementById('api-key-input');
  const keyStatus = document.getElementById('key-status');

  // ── 테마 데이터 ───────────────────────────────

  const THEMES = {
    dark: {
      label: '다크',
      vars: {
        '--bg': '#1e1e1e', '--bg2': '#252526', '--bg3': '#2d2d30', '--bg4': '#3c3c3c',
        '--border': '#3c3c3c', '--text': '#cccccc', '--text-dim': '#888888',
      },
    },
    light: {
      label: '라이트',
      vars: {
        '--bg': '#f5f5f5', '--bg2': '#ffffff', '--bg3': '#ebebeb', '--bg4': '#d4d4d4',
        '--border': '#d0d0d0', '--text': '#1e1e1e', '--text-dim': '#666666',
      },
    },
    sepia: {
      label: '세피아',
      vars: {
        '--bg': '#f4ead8', '--bg2': '#fdf6e3', '--bg3': '#ecddc0', '--bg4': '#d9c49c',
        '--border': '#d0b880', '--text': '#4a3728', '--text-dim': '#8a7260',
      },
    },
    oled: {
      label: 'OLED',
      vars: {
        '--bg': '#000000', '--bg2': '#0a0a0a', '--bg3': '#111111', '--bg4': '#1a1a1a',
        '--border': '#222222', '--text': '#e0e0e0', '--text-dim': '#555555',
      },
    },
    forest: {
      label: '포레스트',
      vars: {
        '--bg': '#1a2420', '--bg2': '#1f2e29', '--bg3': '#263832', '--bg4': '#2f4840',
        '--border': '#2f4840', '--text': '#c5d8cc', '--text-dim': '#6a8f7a',
      },
    },
  };

  const ACCENTS = {
    blue:   { label: '블루',   color: '#0e7cff', hover: '#1a8cff' },
    indigo: { label: '인디고', color: '#7c4dff', hover: '#8b5cff' },
    mint:   { label: '민트',   color: '#00bcd4', hover: '#00d4ec' },
    green:  { label: '그린',   color: '#4caf50', hover: '#5bc460' },
    orange: { label: '오렌지', color: '#ff9800', hover: '#ffab2e' },
    pink:   { label: '핑크',   color: '#e91e63', hover: '#f72b73' },
  };

  const THEME_KEY  = 'lightnote-theme';
  const ACCENT_KEY = 'lightnote-accent';

  // ── 테마 적용 ─────────────────────────────────

  function applyTheme(key) {
    const theme = THEMES[key];
    if (!theme) return;
    const root = document.documentElement;
    for (const [prop, val] of Object.entries(theme.vars)) {
      root.style.setProperty(prop, val);
    }
    localStorage.setItem(THEME_KEY, key);
  }

  function applyAccent(key) {
    const accent = ACCENTS[key];
    if (!accent) return;
    document.documentElement.style.setProperty('--accent', accent.color);
    document.documentElement.style.setProperty('--accent-hover', accent.hover);
    localStorage.setItem(ACCENT_KEY, key);
  }

  // ── 테마 그리드 렌더링 ────────────────────────

  function renderThemeGrid() {
    const grid = document.getElementById('theme-grid');
    if (!grid) return;
    const current = localStorage.getItem(THEME_KEY) || 'dark';
    grid.innerHTML = '';
    for (const [key, theme] of Object.entries(THEMES)) {
      const v = theme.vars;
      const swatch = document.createElement('div');
      swatch.className = 'theme-swatch' + (key === current ? ' active' : '');
      swatch.dataset.theme = key;
      swatch.innerHTML = `
        <div class="swatch-preview" style="background:${v['--bg2']}">
          <div class="swatch-bar" style="background:${v['--bg3']}"></div>
          <div class="swatch-lines">
            <div class="swatch-line" style="background:${v['--text']};width:72%"></div>
            <div class="swatch-line" style="background:${v['--text']};width:52%"></div>
          </div>
        </div>
        <div class="swatch-name">${theme.label}</div>
      `;
      swatch.addEventListener('click', () => {
        applyTheme(key);
        grid.querySelectorAll('.theme-swatch').forEach(s => s.classList.remove('active'));
        swatch.classList.add('active');
      });
      grid.appendChild(swatch);
    }
  }

  // ── 강조 색상 그리드 렌더링 ───────────────────

  function renderAccentGrid() {
    const grid = document.getElementById('accent-grid');
    if (!grid) return;
    const current = localStorage.getItem(ACCENT_KEY) || 'blue';
    grid.innerHTML = '';
    for (const [key, accent] of Object.entries(ACCENTS)) {
      const dot = document.createElement('div');
      dot.className = 'accent-dot' + (key === current ? ' active' : '');
      dot.dataset.accent = key;
      dot.style.background = accent.color;
      dot.title = accent.label;
      dot.addEventListener('click', () => {
        applyAccent(key);
        grid.querySelectorAll('.accent-dot').forEach(d => d.classList.remove('active'));
        dot.classList.add('active');
      });
      grid.appendChild(dot);
    }
  }

  // ── 초기화 (localStorage 복원) ────────────────

  (function initAppearance() {
    const savedTheme  = localStorage.getItem(THEME_KEY);
    const savedAccent = localStorage.getItem(ACCENT_KEY);
    if (savedTheme)  applyTheme(savedTheme);
    if (savedAccent) applyAccent(savedAccent);
  })();

  // ── 모달 열기/닫기 ───────────────────────────

  function open() {
    keyStatus.textContent = '';
    keyStatus.className = 'key-status';
    renderThemeGrid();
    renderAccentGrid();
    modal.style.display = 'flex';
    keyInput.focus();
  }

  function close() {
    modal.style.display = 'none';
  }

  btnOpen.addEventListener('click', open);
  btnCancel.addEventListener('click', close);

  modal.addEventListener('click', (e) => {
    if (e.target === modal) close();
  });

  modal.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
    if (e.key === 'Enter' && e.target === keyInput) btnSave.click();
  });

  btnToggle.addEventListener('click', () => {
    keyInput.type = keyInput.type === 'password' ? 'text' : 'password';
    btnToggle.textContent = keyInput.type === 'password' ? '👁' : '🙈';
  });

  // ── API 키 테스트 ─────────────────────────────

  btnTest.addEventListener('click', async () => {
    const key = keyInput.value.trim();
    if (!key) { setStatus('API 키를 입력해주세요.', false); return; }
    setStatus('테스트 중...', null);
    btnTest.disabled = true;
    try {
      const result = await window.lightnote.saveApiKey(key);
      if (result.success) {
        setStatus('✓ 연결 성공!', true);
      } else {
        setStatus('✗ 유효하지 않은 API 키입니다.', false);
      }
    } catch {
      setStatus('✗ 연결 실패.', false);
    } finally {
      btnTest.disabled = false;
    }
  });

  // ── API 키 저장 ───────────────────────────────

  btnSave.addEventListener('click', async () => {
    const key = keyInput.value.trim();
    if (!key) { setStatus('API 키를 입력해주세요.', false); return; }
    setStatus('저장 중...', null);
    btnSave.disabled = true;
    try {
      const result = await window.lightnote.saveApiKey(key);
      if (result.success) {
        setStatus('✓ 저장됨', true);
        setTimeout(close, 800);
      } else {
        setStatus('✗ 유효하지 않은 API 키입니다.', false);
      }
    } catch {
      setStatus('✗ 저장 실패.', false);
    } finally {
      btnSave.disabled = false;
    }
  });

  function setStatus(msg, ok) {
    keyStatus.textContent = msg;
    keyStatus.className = 'key-status' + (ok === true ? ' ok' : ok === false ? ' err' : '');
  }

  window.settingsUI = { open };
})();
