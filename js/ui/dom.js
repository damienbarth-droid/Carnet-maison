// Briques d'interface réutilisables : échappement, toasts, feuilles (bottom sheets), gestes, animations.
import { icon } from './icons.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Petite vibration (Android) pour confirmer une action. */
export function haptic(ms = 12) { try { navigator.vibrate?.(ms); } catch { /* ignoré */ } }

/* ---------- Toast ---------- */
let toastTimer;
export function toast(msg, { action, onAction, duration = 3200, tone = '' } = {}) {
  const el = $('#toast');
  el.className = `toast ${tone}`;
  el.innerHTML = `<span>${esc(msg)}</span>${action ? `<button type="button">${icon('arrow-counter-clockwise')}${esc(action)}</button>` : ''}`;
  el.hidden = false;
  requestAnimationFrame(() => el.classList.add('show'));
  const hide = () => { el.classList.remove('show'); setTimeout(() => { el.hidden = true; }, 250); };
  if (action) el.querySelector('button').onclick = () => { clearTimeout(toastTimer); hide(); onAction?.(); };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hide, action ? Math.max(duration, 5000) : duration);
}

/* ---------- Feuille du bas (bottom sheet) ---------- */
/**
 * Ouvre une feuille. `content` : HTML. `onMount(root, close)` branche les événements.
 * Renvoie une promesse résolue avec la valeur passée à close().
 */
export function sheet(content, onMount, { label = 'Fenêtre' } = {}) {
  return new Promise(resolve => {
    const prevFocus = document.activeElement;
    const wrap = document.createElement('div');
    wrap.className = 'sheet-wrap';
    wrap.innerHTML = `<div class="sheet-backdrop"></div>
      <div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(label)}">
        <div class="sheet-grip" aria-hidden="true"></div>
        <div class="sheet-body">${content}</div>
      </div>`;
    document.body.appendChild(wrap);
    document.body.classList.add('no-scroll');
    const panel = $('.sheet', wrap);
    let closed = false;
    const close = (value) => {
      if (closed) return;
      closed = true;
      wrap.classList.remove('open');
      document.removeEventListener('keydown', onKey);
      setTimeout(() => {
        wrap.remove();
        if (!$('.sheet-wrap')) document.body.classList.remove('no-scroll');
        prevFocus?.focus?.({ preventScroll: true });
      }, reducedMotion() ? 0 : 280);
      resolve(value);
    };
    const onKey = e => { if (e.key === 'Escape') close(null); };
    document.addEventListener('keydown', onKey);
    $('.sheet-backdrop', wrap).addEventListener('click', () => close(null));

    // Glisser vers le bas pour fermer.
    let startY = null, dy = 0;
    const grip = $('.sheet-grip', wrap);
    const down = e => { if (panel.scrollTop > 0 && e.target !== grip) return; startY = e.clientY; dy = 0; panel.style.transition = 'none'; };
    const move = e => { if (startY == null) return; dy = Math.max(0, e.clientY - startY); panel.style.transform = `translateY(${dy}px)`; };
    const up = () => {
      if (startY == null) return;
      startY = null; panel.style.transition = ''; panel.style.transform = '';
      if (dy > 110) close(null);
    };
    grip.addEventListener('pointerdown', e => { grip.setPointerCapture(e.pointerId); down(e); });
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', up);
    panel.addEventListener('touchstart', e => {
      const t = e.target;
      if (t.closest('input, textarea, select, .h-scroll') || t === grip) return;
      down({ clientY: e.touches[0].clientY, target: t });
    }, { passive: true });
    panel.addEventListener('touchmove', e => e.touches[0] && move(e.touches[0]), { passive: true });
    panel.addEventListener('touchend', up);

    onMount?.(panel, close);
    requestAnimationFrame(() => {
      wrap.classList.add('open');
      const first = panel.querySelector('[autofocus], input, select, textarea, button:not(.sheet-grip)');
      first?.focus({ preventScroll: true });
    });
  });
}

/** Confirmation élégante (remplace window.confirm). */
export function confirmSheet({ title, text = '', confirm = 'Confirmer', danger = false, iconName = danger ? 'warning-circle' : 'info' }) {
  return sheet(`
    <div class="sheet-hero ${danger ? 'danger' : ''}">${icon(iconName)}</div>
    <h2 class="sheet-title">${esc(title)}</h2>
    ${text ? `<p class="sheet-text">${esc(text)}</p>` : ''}
    <div class="sheet-actions">
      <button class="btn ${danger ? 'btn-danger-solid' : 'btn-primary'}" data-ok>${esc(confirm)}</button>
      <button class="btn btn-ghost" data-cancel>Annuler</button>
    </div>`, (root, close) => {
    $('[data-ok]', root).onclick = () => close(true);
    $('[data-cancel]', root).onclick = () => close(false);
  }, { label: title }).then(v => v === true);
}

/** Liste d'options dans une feuille. options : [{ value, label, sub, icon }] */
export function chooseSheet({ title, options }) {
  return sheet(`
    <h2 class="sheet-title">${esc(title)}</h2>
    <div class="menu">
      ${options.map((o, i) => `<button class="menu-item" data-i="${i}">
        ${o.icon ? `<span class="menu-ico">${icon(o.icon)}</span>` : ''}
        <span class="menu-txt"><strong>${esc(o.label)}</strong>${o.sub ? `<small>${esc(o.sub)}</small>` : ''}</span>
        ${o.selected ? icon('check', 'menu-check') : icon('caret-right', 'menu-caret')}
      </button>`).join('')}
    </div>`, (root, close) => {
    root.querySelectorAll('[data-i]').forEach(b => { b.onclick = () => close(options[+b.dataset.i].value); });
  }, { label: title });
}

/* ---------- Fichiers : partager ou télécharger ---------- */
/** À appeler directement dans un clic (exigence de Safari pour le partage). */
export async function shareOrDownload(blob, name, title) {
  const file = new File([blob], name, { type: blob.type });
  const coarse = matchMedia('(pointer: coarse)').matches;
  if (coarse && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title }); return 'shared'; }
    catch (e) { if (e.name === 'AbortError') return 'cancelled'; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  return 'downloaded';
}

/* ---------- Visualisations ---------- */
/** Anneau de progression (0–100). */
export function ring(value, { size = 112, stroke = 10, tone = 'accent', label = '' } = {}) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const v = value == null ? 0 : Math.max(0, Math.min(100, value));
  return `<div class="ring ring-${tone}" style="--size:${size}px">
    <svg viewBox="0 0 ${size} ${size}" aria-hidden="true">
      <circle class="ring-track" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}" />
      <circle class="ring-value" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}"
        stroke-dasharray="${c}" stroke-dashoffset="${c}" data-target="${c * (1 - v / 100)}" />
    </svg>
    <div class="ring-label">${value == null ? '<span class="ring-num">—</span>' : `<span class="ring-num" data-count="${v}">0</span><span class="ring-unit">%</span>`}${label ? `<small>${esc(label)}</small>` : ''}</div>
  </div>`;
}

export function bar(progress, tone = '') {
  return `<div class="bar ${tone}" role="presentation"><span style="--p:${Math.round((progress || 0) * 100)}%"></span></div>`;
}

/** Lance les animations d'entrée (anneaux, compteurs, barres). */
export function animateIn(root) {
  const rm = reducedMotion();
  root.querySelectorAll('.ring-value').forEach(c => {
    requestAnimationFrame(() => requestAnimationFrame(() => { c.style.strokeDashoffset = c.dataset.target; }));
  });
  root.querySelectorAll('[data-count]').forEach(el => {
    const target = +el.dataset.count;
    if (rm || !target) { el.textContent = target.toLocaleString('fr-FR'); return; }
    const t0 = performance.now(), dur = 900;
    const step = t => {
      const k = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      el.textContent = Math.round(target * e).toLocaleString('fr-FR');
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
  root.querySelectorAll('.stagger > *').forEach((el, i) => el.style.setProperty('--i', Math.min(i, 12)));
}

/* ---------- Glisser une carte ---------- */
/** Glisser à droite → onRight, à gauche → onLeft. La carte doit contenir .swipe-face. */
export function attachSwipe(card, { onRight, onLeft }) {
  const face = card.querySelector('.swipe-face');
  if (!face) return;
  let x0 = null, y0 = 0, dx = 0, locked = null, id = null;
  const TH = 0.32;
  const reset = () => { face.style.transition = ''; face.style.transform = ''; card.classList.remove('sw-right', 'sw-left', 'sw-armed'); };
  face.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    x0 = e.clientX; y0 = e.clientY; dx = 0; locked = null; id = e.pointerId;
  });
  face.addEventListener('pointermove', e => {
    if (x0 == null || e.pointerId !== id) return;
    const mx = e.clientX - x0, my = e.clientY - y0;
    if (!locked) {
      if (Math.abs(mx) < 8 && Math.abs(my) < 8) return;
      locked = Math.abs(mx) > Math.abs(my) * 1.2 ? 'x' : 'y';
      if (locked === 'x') { face.setPointerCapture(id); face.style.transition = 'none'; }
    }
    if (locked !== 'x') return;
    dx = mx;
    if ((dx > 0 && !onRight) || (dx < 0 && !onLeft)) dx = dx / 4;
    face.style.transform = `translateX(${dx}px)`;
    card.classList.toggle('sw-right', dx > 0);
    card.classList.toggle('sw-left', dx < 0);
    const armed = Math.abs(dx) > card.offsetWidth * TH;
    if (armed !== card.classList.contains('sw-armed')) { card.classList.toggle('sw-armed', armed); if (armed) haptic(8); }
  });
  const end = e => {
    if (x0 == null || e.pointerId !== id) return;
    const wasX = locked === 'x';
    x0 = null;
    if (!wasX) return;
    const w = card.offsetWidth;
    if (dx > w * TH && onRight) {
      face.style.transition = 'transform .25s ease'; face.style.transform = `translateX(${w}px)`;
      setTimeout(() => { onRight(); }, 200);
    } else if (dx < -w * TH && onLeft) {
      reset(); onLeft();
    } else reset();
    // Empêche le clic qui suit un glissement.
    if (Math.abs(dx) > 8) face.addEventListener('click', ev => { ev.preventDefault(); ev.stopPropagation(); }, { capture: true, once: true });
  };
  face.addEventListener('pointerup', end);
  face.addEventListener('pointercancel', e => { x0 = null; if (locked === 'x') reset(); });
}

/* ---------- Illustrations des écrans vides ---------- */
export function emptyState({ iconName, title, text, action = '' }) {
  return `<div class="empty-state">
    <div class="empty-art" aria-hidden="true">
      <span class="blob b1"></span><span class="blob b2"></span>
      <span class="empty-ico">${icon(iconName)}</span>
    </div>
    <h3>${esc(title)}</h3>
    <p>${esc(text)}</p>
    ${action}
  </div>`;
}
