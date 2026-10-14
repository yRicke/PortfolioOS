(() => {
  'use strict';
  const embedded = document.body.classList.contains('os-embedded') && window.parent !== window;
  const notify = message => { if (embedded) window.parent.postMessage(message, location.origin); };
  let cursorBusy = false, mousePresent = matchMedia('(pointer: fine)').matches;
  const loader = document.createElement('span');
  loader.className = 'os-cursor-loader'; loader.hidden = true; loader.setAttribute('aria-hidden', 'true'); document.body.append(loader);
  document.addEventListener('pointermove', event => {
    mousePresent = event.pointerType === 'mouse';
    const busy = cursorBusy || document.body.classList.contains('os-busy');
    loader.hidden = !busy || event.pointerType !== 'mouse';
    loader.style.left = `${event.clientX + 17}px`; loader.style.top = `${event.clientY + 16}px`;
  }, { passive: true });
  document.documentElement.addEventListener('pointerleave', () => { loader.hidden = true; });
  new MutationObserver(() => { loader.hidden = !(document.body.classList.contains('os-busy') || cursorBusy) || !mousePresent; }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  window.addEventListener('message', event => {
    if (!embedded || event.origin !== location.origin || event.source !== window.parent) return;
    if (event.data?.type === 'henri-os:busy') { cursorBusy = Boolean(event.data.busy); loader.hidden = !cursorBusy || !mousePresent; }
  });
  document.addEventListener('pointerdown', () => notify({ type: 'henri-os:focus' }), { passive: true });
  document.addEventListener('focusin', () => notify({ type: 'henri-os:focus' }));
  document.addEventListener('keydown', event => { if (event.key === 'Escape') notify({ type: 'henri-os:escape' }); });
  document.addEventListener('input', event => { if (event.target.closest('form')) notify({ type: 'henri-os:dirty', dirty: true }); });
  document.addEventListener('change', event => { if (event.target.closest('form')) notify({ type: 'henri-os:dirty', dirty: true }); });
  document.addEventListener('submit', () => notify({ type: 'henri-os:dirty', dirty: false }));
  document.addEventListener('portfolio:updated', () => notify({ type: 'henri-os:changed' }));
  document.addEventListener('click', event => {
    if (event.target.closest('[data-print-document]')) window.print();
    if (!embedded || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest('a[href]');
    if (!link || link.target || link.hasAttribute('download')) return;
    const url = new URL(link.href, location.href);
    if (url.origin !== location.origin || !['http:', 'https:'].includes(url.protocol)) return;
    if (url.pathname === location.pathname && url.hash) return;
    if (url.pathname === '/sair/') { event.preventDefault(); window.top.location.href = url.href; return; }
    event.preventDefault();
    const legacy = { '#projetos': ['/projetos/', 'projetos', 'Meus projetos'], '#sobre': ['/sobre/', 'sobre', 'Sobre mim.txt'] }[url.hash];
    notify({ type: 'henri-os:open', url: legacy?.[0] || url.pathname + url.search, id: legacy?.[1] || link.dataset.osApp, title: legacy?.[2] || link.dataset.osTitle || link.getAttribute('aria-label') || link.textContent.trim() });
  });
  document.querySelectorAll('[data-project-image]').forEach(image => {
    const fallback = () => { image.closest('[data-image-frame]')?.classList.add('is-broken'); if (!image.closest('[data-image-frame]')) image.hidden = true; };
    image.addEventListener('error', fallback);
    if (image.complete && !image.naturalWidth) fallback();
  });
  document.querySelectorAll('[data-project-carousel]').forEach(carousel => {
    const slides = Array.from(carousel.querySelectorAll('[data-project-slide]'));
    let index = 0, startX = null;
    function show(next) {
      index = (next + slides.length) % slides.length;
      slides.forEach((slide, i) => { slide.classList.toggle('is-active', i === index); slide.setAttribute('aria-hidden', String(i !== index)); });
      const current = carousel.querySelector('[data-project-carousel-current]'); if (current) current.textContent = String(index + 1).padStart(2, '0');
    }
    carousel.querySelector('[data-project-carousel-previous]')?.addEventListener('click', () => show(index - 1));
    carousel.querySelector('[data-project-carousel-next]')?.addEventListener('click', () => show(index + 1));
    carousel.addEventListener('keydown', event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); show(index + (event.key === 'ArrowRight' ? 1 : -1)); } });
    carousel.addEventListener('pointerdown', event => { if (!event.target.closest('button')) startX = event.clientX; });
    carousel.addEventListener('pointerup', event => { if (startX !== null && Math.abs(event.clientX - startX) > 45) show(index + (event.clientX < startX ? 1 : -1)); startX = null; });
    carousel.addEventListener('pointercancel', () => { startX = null; });
    if (slides.length) show(0);
  });
  if (document.querySelector('[data-content-changed]')) notify({ type: 'henri-os:changed' });
  if (embedded && location.pathname === '/') notify({ type: 'henri-os:home' });
})();
