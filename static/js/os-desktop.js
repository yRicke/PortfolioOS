(() => {
  'use strict';
  const desktop = document.getElementById('os-desktop');
  if (!desktop) return;
  const stage = desktop.querySelector('[data-os-windows]');
  const tasks = desktop.querySelector('[data-os-tasks]');
  const start = desktop.querySelector('[data-os-start]');
  const menu = desktop.querySelector('.os-start-menu');
  const boot = document.querySelector('[data-os-boot]');
  const status = desktop.querySelector('.os-loading-status');
  const initialContent = document.getElementById('os-page-content');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mobile = matchMedia('(max-width: 620px)');
  const windows = new Map();
  const pending = new Map();
  let active = null, zIndex = 10, bootTimer, audio;
  const readStorage = (storage, key, fallback) => { try { return JSON.parse(storage.getItem(key)) ?? fallback; } catch { return fallback; } };
  const writeStorage = (storage, key, value) => { try { storage.setItem(key, JSON.stringify(value)); } catch { /* O desktop também funciona sem armazenamento. */ } };
  const savedSettings = readStorage(localStorage, 'henri-os:settings', {});
  const settings = { scanlines: savedSettings.scanlines !== false, sound: savedSettings.sound === true, delay: [0, 600, 1800].includes(savedSettings.delay) ? savedSettings.delay : 1800 };
  const names = { inicio: 'Bem-vindo.txt', projetos: 'Meus projetos', sobre: 'Sobre mim.txt', contato: 'Caixa de entrada', curriculo: 'Currículo.txt', entrar: 'Acesso do administrador', painel_projetos: 'Organizar projetos', adicionar_projeto: 'Adicionar projeto', painel_chave_api: 'Chave da API' };
  const pathKeys = { '/': 'inicio', '/projetos/': 'projetos', '/sobre/': 'sobre', '/contato/': 'contato', '/curriculo/': 'curriculo', '/entrar/': 'entrar', '/painel/projetos/': 'painel_projetos', '/adicionar_projeto/': 'adicionar_projeto', '/painel/api/': 'painel_chave_api' };
  const appKey = path => { const match = path.match(/^\/(projeto|editar_projeto)\/(\d+)\/$/); return pathKeys[path] || (match ? `${match[1] === 'projeto' ? 'projeto' : 'editar'}-${match[2]}` : path); };
  const normalizedURL = value => { const url = new URL(value || '/', location.origin); if (url.origin !== location.origin) throw new Error('A janela deve pertencer ao portfólio.'); url.searchParams.delete('janela'); return url; };
  function persistWindows() {
    writeStorage(sessionStorage, 'henri-os:windows', Array.from(windows.values()).map(w => ({ id: w.id, title: w.title, url: w.url, x: parseFloat(w.node.style.left), y: parseFloat(w.node.style.top), width: parseFloat(w.node.style.width), height: parseFloat(w.node.style.height), minimized: w.node.hidden, maximized: w.node.classList.contains('is-maximized') })));
  }
  function playSound(kind) {
    if (!settings.sound || reducedMotion) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      audio ||= new AudioContext();
      audio.resume().catch(() => {});
      const notes = kind === 'boot' ? [261.63, 329.63, 392, 523.25] : [kind === 'close' ? 220 : 440];
      notes.forEach((frequency, index) => {
        const oscillator = audio.createOscillator(), gain = audio.createGain();
        const when = audio.currentTime + index * .11;
        oscillator.type = 'triangle'; oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(.0001, when); gain.gain.exponentialRampToValueAtTime(.045, when + .012); gain.gain.exponentialRampToValueAtTime(.0001, when + .17);
        oscillator.connect(gain); gain.connect(audio.destination); oscillator.start(when); oscillator.stop(when + .18);
      });
    } catch { /* Som opcional; falhas de áudio não bloqueiam a navegação. */ }
  }
  function sendToFrames(message) { windows.forEach(w => w.frame?.contentWindow?.postMessage(message, location.origin)); }
  function applySettings() {
    document.documentElement.style.setProperty('--os-scan-opacity', settings.scanlines ? '.045' : '0');
    desktop.querySelector('[data-os-sound]').setAttribute('aria-pressed', String(settings.sound));
    desktop.querySelector('[data-os-sound]').setAttribute('aria-label', settings.sound ? 'Desativar sons' : 'Ativar sons');
    desktop.querySelectorAll('[data-os-setting]').forEach(input => { if (input.type === 'checkbox') input.checked = settings[input.dataset.osSetting]; else input.value = String(settings[input.dataset.osSetting]); });
    sendToFrames({ type: 'henri-os:appearance', scanlines: settings.scanlines });
  }
  function closeMenu() { menu.hidden = true; start.setAttribute('aria-expanded', 'false'); }
  function drawTasks() {
    tasks.replaceChildren();
    windows.forEach(w => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'os-button os-task'; button.dataset.osTask = w.id;
      button.setAttribute('aria-pressed', String(active === w.id && !w.node.hidden)); button.setAttribute('aria-label', `${w.node.hidden ? 'Restaurar' : 'Alternar para'} ${w.title}`); button.title = w.title;
      const text = document.createElement('span'); text.textContent = w.title; button.append(text); tasks.append(button);
    });
  }
  function activate(id, focusControl = false) {
    const w = windows.get(id); if (!w) return;
    windows.forEach(win => win.node.classList.remove('is-active'));
    w.node.hidden = false; w.node.classList.add('is-active'); w.node.style.zIndex = ++zIndex; active = id; drawTasks();
    if (focusControl) w.node.querySelector('.os-window-title').focus({ preventScroll: true });
    persistWindows();
  }
  function activateNext() {
    active = null;
    const next = Array.from(windows.values()).filter(w => !w.node.hidden).sort((a, b) => Number(b.node.style.zIndex) - Number(a.node.style.zIndex))[0];
    if (next) activate(next.id); else { drawTasks(); persistWindows(); }
  }
  function clamp(w) {
    if (mobile.matches || w.node.classList.contains('is-maximized')) return;
    const width = Math.max(280, Math.min(parseFloat(w.node.style.width) || 560, stage.clientWidth - 8));
    const height = Math.max(190, Math.min(parseFloat(w.node.style.height) || 440, stage.clientHeight - 8));
    w.node.style.width = `${width}px`; w.node.style.height = `${height}px`;
    w.node.style.left = `${Math.max(4, Math.min(parseFloat(w.node.style.left) || 4, stage.clientWidth - width - 4))}px`;
    w.node.style.top = `${Math.max(4, Math.min(parseFloat(w.node.style.top) || 4, stage.clientHeight - height - 4))}px`;
  }
  function maximize(w) {
    const max = w.node.classList.toggle('is-maximized'); const button = w.node.querySelector('[data-window-action="maximize"]');
    button.textContent = max ? '▣' : '□'; button.setAttribute('aria-label', `${max ? 'Restaurar' : 'Maximizar'} ${w.title}`); if (!max) clamp(w); persistWindows();
  }
  function setTitle(w, title) { w.title = title; const heading = w.node.querySelector('.os-window-title'); heading.textContent = title; heading.setAttribute('aria-label', `${title}. Use as setas para mover a janela.`); w.node.setAttribute('aria-label', title); drawTasks(); }
  function returnHome(w) { if (w.url === '/') return; w.node.remove(); windows.delete(w.id); persistWindows(); location.reload(); }
  function createWindow({ id, title, url, content, geometry }) {
    if (windows.has(id)) { activate(id, true); return windows.get(id); }
    const node = document.createElement('section'); node.className = 'os-window'; node.dataset.osWindow = id; node.setAttribute('role', 'region'); node.setAttribute('aria-label', title);
    node.innerHTML = '<header class="os-titlebar"><span class="os-window-icon" aria-hidden="true">▤</span><button type="button" class="os-window-title"></button><div class="os-window-controls"><button type="button" class="os-button" data-window-action="minimize">_</button><button type="button" class="os-button" data-window-action="maximize">□</button><button type="button" class="os-button" data-window-action="close">×</button></div></header><div class="os-window-menubar" aria-hidden="true"><span>Arquivo</span><span>Exibir</span><span>Ajuda</span></div><div class="os-window-body"></div><footer class="os-window-status"><span>Portfolio OS · Henrique Vieira</span><span>Pronto</span></footer><button type="button" class="os-resize-handle" aria-label="Redimensionar janela. Use as setas."></button>';
    const sizes = id === 'projetos' || id.startsWith('projeto-') || id === 'painel_projetos' ? [790, 570] : id === 'inicio' ? [570, 540] : [560, 470];
    Object.assign(node.style, { left: `${geometry?.x ?? 150 + windows.size * 32}px`, top: `${geometry?.y ?? 65 + windows.size * 28}px`, width: `${geometry?.width ?? sizes[0]}px`, height: `${geometry?.height ?? sizes[1]}px` });
    const w = { id, title, url: url || '', node, frame: null, dirty: false }; windows.set(id, w); stage.append(node); setTitle(w, title);
    ['minimize', 'maximize', 'close'].forEach(action => node.querySelector(`[data-window-action="${action}"]`).setAttribute('aria-label', `${{ minimize: 'Minimizar', maximize: 'Maximizar', close: 'Fechar' }[action]} ${title}`));
    const body = node.querySelector('.os-window-body');
    if (content) body.append(content);
    else {
      const frame = document.createElement('iframe'); frame.title = title; w.frame = frame;
      const address = normalizedURL(url); address.searchParams.set('janela', '1'); frame.src = address.href;
      node.querySelector('.os-window-status > span:last-child').textContent = 'Carregando…';
      frame.addEventListener('load', () => {
        node.querySelector('.os-window-status > span:last-child').textContent = 'Pronto';
        try {
          if (frame.contentWindow.location.pathname === '/' && w.url !== '/') { returnHome(w); return; }
          const pageTitle = frame.contentDocument.title.replace(/\s+[—–]\s+(?:Portfolio OS|Henrique Vieira|Portfólio).*$/, '');
          if (pageTitle) setTitle(w, pageTitle);
          frame.contentWindow.postMessage({ type: 'henri-os:appearance', scanlines: settings.scanlines }, location.origin);
        } catch { node.querySelector('.os-window-status > span:last-child').textContent = 'Indisponível'; }
      });
      body.append(frame);
    }
    const titlebar = node.querySelector('.os-titlebar');
    titlebar.addEventListener('dblclick', event => { if (!event.target.closest('.os-window-controls')) maximize(w); });
    function pointerOperation(handle, resize) {
      handle.addEventListener('pointerdown', event => {
        if (event.button !== 0 || mobile.matches || node.classList.contains('is-maximized') || (!resize && event.target.closest('.os-window-controls'))) return;
        event.preventDefault(); activate(id); handle.setPointerCapture(event.pointerId); node.classList.add('is-dragging');
        const x = event.clientX, y = event.clientY, left = parseFloat(node.style.left), top = parseFloat(node.style.top), width = node.offsetWidth, height = node.offsetHeight;
        const move = e => {
          if (resize) { node.style.width = `${Math.max(280, Math.min(width + e.clientX - x, stage.clientWidth - left - 4))}px`; node.style.height = `${Math.max(190, Math.min(height + e.clientY - y, stage.clientHeight - top - 4))}px`; }
          else { node.style.left = `${left + e.clientX - x}px`; node.style.top = `${top + e.clientY - y}px`; clamp(w); }
        };
        const stop = () => { handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', stop); handle.removeEventListener('pointercancel', stop); node.classList.remove('is-dragging'); persistWindows(); };
        handle.addEventListener('pointermove', move); handle.addEventListener('pointerup', stop); handle.addEventListener('pointercancel', stop);
      });
    }
    pointerOperation(titlebar, false); pointerOperation(node.querySelector('.os-resize-handle'), true);
    node.addEventListener('pointerdown', () => { if (active !== id) activate(id); });
    node.addEventListener('focusin', () => { if (active !== id) activate(id); });
    node.addEventListener('keydown', event => {
      const move = event.target.classList.contains('os-window-title'), resize = event.target.classList.contains('os-resize-handle');
      if ((!move && !resize) || mobile.matches || node.classList.contains('is-maximized') || !event.key.startsWith('Arrow')) return;
      event.preventDefault(); const amount = event.shiftKey ? 30 : 10, horizontal = ['ArrowLeft', 'ArrowRight'].includes(event.key), negative = ['ArrowLeft', 'ArrowUp'].includes(event.key);
      const property = resize ? (horizontal ? 'width' : 'height') : (horizontal ? 'left' : 'top');
      node.style[property] = `${parseFloat(node.style[property]) + (negative ? -amount : amount)}px`; clamp(w); persistWindows();
    });
    clamp(w); if (geometry?.maximized) maximize(w); activate(id);
    if (geometry?.minimized) { node.hidden = true; activateNext(); }
    return w;
  }
  function updateBusy() {
    const busy = pending.size > 0; document.body.classList.toggle('os-busy', busy); status.hidden = !busy;
    status.textContent = busy ? `Abrindo ${Array.from(pending.values()).map(p => p.title).join(', ')}…` : '';
    sendToFrames({ type: 'henri-os:busy', busy });
  }
  function openApp(id, title, url) {
    closeMenu(); if (windows.has(id)) { activate(id, true); return; } if (pending.has(id)) return;
    const timer = setTimeout(() => {
      pending.delete(id); updateBusy();
      const content = id === 'configuracoes' ? document.getElementById('os-settings-content').content.cloneNode(true) : null;
      createWindow({ id, title, url, content }); applySettings(); playSound('open'); persistWindows();
    }, reducedMotion ? 0 : settings.delay);
    pending.set(id, { timer, title }); updateBusy();
  }
  function skipBoot() {
    clearTimeout(bootTimer); boot.hidden = true; desktop.inert = false; writeStorage(sessionStorage, 'henri-os:booted', true);
  }
  function startBoot() {
    closeMenu(); pending.forEach(p => clearTimeout(p.timer)); pending.clear(); updateBusy();
    clearTimeout(bootTimer); boot.hidden = false; desktop.inert = true;
    bootTimer = setTimeout(skipBoot, reducedMotion ? 0 : 2400); playSound('boot');
  }
  document.addEventListener('click', event => {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const trigger = event.target.closest('[data-os-app]');
    if (trigger) { event.preventDefault(); openApp(trigger.dataset.osApp, trigger.dataset.osTitle || trigger.textContent.trim(), trigger.getAttribute('href')); return; }
    const task = event.target.closest('[data-os-task]');
    if (task) { const w = windows.get(task.dataset.osTask); if (active === w.id && !w.node.hidden) { w.node.hidden = true; activateNext(); } else activate(w.id, true); return; }
    const action = event.target.closest('[data-window-action]');
    if (action) {
      const w = windows.get(action.closest('[data-os-window]').dataset.osWindow);
      if (action.dataset.windowAction === 'minimize') { w.node.hidden = true; activateNext(); }
      if (action.dataset.windowAction === 'maximize') maximize(w);
      if (action.dataset.windowAction === 'close') {
        if (w.dirty && !confirm('Descartar as alterações que ainda não foram salvas?')) return;
        w.node.remove(); windows.delete(w.id); activateNext(); playSound('close');
      }
      persistWindows(); return;
    }
    if (event.target.closest('[data-os-start]')) { menu.hidden = !menu.hidden; start.setAttribute('aria-expanded', String(!menu.hidden)); }
    else if (!event.target.closest('.os-start-menu')) closeMenu();
    if (event.target.closest('[data-os-restart]')) startBoot();
    if (event.target.closest('[data-os-skip-boot]')) skipBoot();
    if (event.target.closest('[data-os-sound]')) { settings.sound = !settings.sound; writeStorage(localStorage, 'henri-os:settings', settings); applySettings(); playSound('open'); }
  });
  document.addEventListener('change', event => {
    const key = event.target.dataset.osSetting; if (!key) return;
    settings[key] = event.target.type === 'checkbox' ? event.target.checked : Number(event.target.value);
    writeStorage(localStorage, 'henri-os:settings', settings); applySettings(); if (key === 'sound') playSound('open');
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') { closeMenu(); if (!boot.hidden) skipBoot(); } });
  window.addEventListener('message', event => {
    if (event.origin !== location.origin) return;
    const source = Array.from(windows.values()).find(w => w.frame?.contentWindow === event.source); if (!source) return;
    const message = event.data;
    if (message?.type === 'henri-os:open') {
      try { const url = normalizedURL(message.url); openApp(appKey(url.pathname), message.title || names[pathKeys[url.pathname]] || 'Portfolio OS', url.pathname + url.search); } catch { /* Links externos usam a navegação normal. */ }
    }
    if (message?.type === 'henri-os:focus' && active !== source.id) activate(source.id);
    if (message?.type === 'henri-os:dirty') source.dirty = Boolean(message.dirty);
    if (message?.type === 'henri-os:escape') closeMenu();
    if (message?.type === 'henri-os:changed') {
      source.dirty = false;
      windows.forEach(w => { if (w !== source && !w.dirty && w.frame && (w.id === 'projetos' || w.url.startsWith('/projeto/'))) w.frame.contentWindow.location.reload(); });
      const welcome = windows.get('inicio');
      if (welcome && !welcome.frame) fetch('/?janela=1', { cache: 'no-store' }).then(response => { if (!response.ok) throw new Error(); return response.text(); }).then(html => {
        const updated = new DOMParser().parseFromString(html, 'text/html').querySelector('.os-welcome');
        if (updated) welcome.node.querySelector('.os-welcome')?.replaceWith(updated);
      }).catch(() => {});
    }
    if (message?.type === 'henri-os:home') returnHome(source);
  });
  const initialKey = appKey(location.pathname);
  const initialTitle = names[initialKey] || document.title.replace(/\s+[—–].*$/, '');
  const savedWindows = readStorage(sessionStorage, 'henri-os:windows', []);
  createWindow({ id: initialKey, title: initialTitle, url: location.pathname, content: initialContent });
  if (Array.isArray(savedWindows)) savedWindows.slice(0, 15).forEach(saved => {
    if (saved.id === initialKey || !saved.url && saved.id !== 'configuracoes') return;
    try {
      if (saved.id === 'configuracoes') createWindow({ ...saved, geometry: saved, content: document.getElementById('os-settings-content').content.cloneNode(true) });
      else { const url = normalizedURL(saved.url); createWindow({ ...saved, url: url.pathname + url.search, geometry: saved }); }
    } catch { /* Ignora estados antigos incompatíveis. */ }
  });
  applySettings();
  const updateClock = () => { desktop.querySelector('[data-os-clock]').textContent = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }).format(new Date()); };
  updateClock(); setInterval(updateClock, 60000);
  new ResizeObserver(() => windows.forEach(clamp)).observe(stage);
  mobile.addEventListener('change', () => { windows.forEach(clamp); persistWindows(); });
  if (readStorage(sessionStorage, 'henri-os:booted', false)) skipBoot(); else startBoot();
  const legacyHash = { '#projetos': ['projetos', '/projetos/'], '#sobre': ['sobre', '/sobre/'] }[location.hash];
  if (legacyHash) { const openLegacy = () => openApp(legacyHash[0], names[legacyHash[0]], legacyHash[1]); if (boot.hidden) openLegacy(); else setTimeout(openLegacy, reducedMotion ? 0 : 2450); }
})();
