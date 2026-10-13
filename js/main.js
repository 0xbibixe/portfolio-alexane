import { PROJECTS, SHOOTS, MOBILE_COVERS, CATEGORIES } from './data.js?v=87';

const VIEWS = ['index', 'info'];
const HOME = 'index';

const $ = (sel) => document.querySelector(sel);

/**
 * Small DOM builder. Text is always set via textContent (no HTML injection).
 * @param {string} tag
 * @param {Record<string, string>} [attrs]
 * @param {Array<Node|string>} [children]
 */
function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === 'text') node.textContent = v;
    else node.setAttribute(k, v);
  });
  children.forEach((c) => node.append(c));
  return node;
}

const pad = (n) => String(n + 1).padStart(2, '0');
const isLandscape = ([, w, h]) => w > h * 1.1;

function img([src, w, h], alt, eager = false) {
  return el('img', {
    src, alt, width: String(w), height: String(h),
    loading: eager ? 'eager' : 'lazy', decoding: 'async',
  });
}

/* ── State ─────────────────────────────────────────────── */
const state = { view: HOME, filter: 'all', lastTrigger: null, back: null, parentScroll: null, indexMode: 'reel' };

/* ── Wordmark: scale text to fill header width ─────────── */
function fitWordmark() {
  const text = $('#wordmark');
  const box = text.parentElement;
  text.style.fontSize = '100px';
  const ratio = box.clientWidth / text.scrollWidth;
  text.style.fontSize = `${Math.floor(100 * ratio * 1000) / 1000}px`;
}

/* ── Render: INDEX (numbered grid) ─────────────────────── */
const phone = matchMedia('(max-width: 600px)');

/* Reel of the All page. On phones it uses vertical pictures (MOBILE_COVERS) and skips projects without one. */
function fillReel(stage) {
  stage.replaceChildren();
  PROJECTS.forEach((p, i) => {
    const mobile = phone.matches ? MOBILE_COVERS[p.slug] : null;
    if (phone.matches && !mobile) return;
    stage.append(
      el('a', { class: 'reel-item', href: `#p/${p.slug}`, 'aria-label': p.title }, [
        img(mobile ?? p.cover ?? p.images[0], p.title, true),
        el('div', { class: 'reel-cap' }, [
          el('span', { class: 'num', text: pad(i) }),
          el('span', {}, [
            el('span', { class: 't', text: p.title }),
            el('br'),
            el('span', { class: 'sub', text: p.tag }),
          ]),
        ]),
      ]),
    );
  });
}

function renderIndex() {
  const root = $('#view-index');
  const stage = el('div', { class: 'reel-stage' });
  const grid = el('div', { class: 'idx-grid' });
  fillReel(stage);
  PROJECTS.forEach((p, i) => {
    const cats = p.cats.join(' ');
    const cap = [
      el('span', { class: 'num', text: pad(i) }),
      el('span', {}, [
        el('span', { class: 't', text: p.title }),
        el('br'),
        el('span', { class: 'sub', text: p.tag }),
      ]),
    ];
    grid.append(
      el('a', { class: 'idx-item', href: `#p/${p.slug}`, 'data-cats': cats }, [
        el('div', { class: 'frame' }, [img(p.cover ?? p.images[0], p.title, i < 3)]),
        el('div', { class: 'idx-cap' }, cap),
      ]),
    );
  });
  root.append(stage, grid);
  setIndexMode('reel');
  phone.addEventListener('change', () => { fillReel(stage); layoutReel(); });
}

/* The index has two layouts: the scroll-driven reel (default, straight after the intro)
   and the filterable grid (as soon as a filter of the menu is used). */
function setIndexMode(mode) {
  state.indexMode = mode;
  const root = $('#view-index');
  root.classList.toggle('is-reel', mode === 'reel');
  root.classList.toggle('is-grid', mode === 'grid');
  layoutReel();
}

/* ── Reel: full-screen covers stacked as layers; each one slides up over the others while scrolling ── */
const ease = (t) => t * t * (3 - 2 * t);
const REEL_OVERLAP = 1.5;   // how many "slots" of scroll a cover takes to slide in (>1 = several layers in flight at once)
const REEL_STEP = 1.0;      // screens of scrolling per slot
let reelFrame = 0;

function layoutReel() {
  const root = $('#view-index');
  const n = root.querySelectorAll('.reel-item').length;
  const stage = root.querySelector('.reel-stage');
  if (state.indexMode === 'reel') {
    const units = n - 1 + (REEL_OVERLAP - 1);
    root.style.height = `${Math.round(stage.offsetHeight * (1 + units * REEL_STEP))}px`;
  } else {
    root.style.height = '';
  }
  updateReel();
}

function updateReel() {
  reelFrame = 0;
  const root = $('#view-index');
  if (root.hidden || state.indexMode !== 'reel') return;
  const items = [...root.querySelectorAll('.reel-item')];
  const stage = root.querySelector('.reel-stage');
  const total = Math.max(1, root.offsetHeight - stage.offsetHeight);
  const scrolled = -root.getBoundingClientRect().top;
  const units = items.length - 1 + (REEL_OVERLAP - 1);
  const progress = Math.min(1, Math.max(0, scrolled / total)) * units;
  const enter = (j) => (j <= 0 ? 1 : Math.min(1, Math.max(0, (progress - (j - 1)) / REEL_OVERLAP)));
  let current = 0;
  items.forEach((item, j) => { if (enter(j) >= 0.5) current = j; });
  items.forEach((item, j) => {
    const e = enter(j);
    const next = j + 1 < items.length ? enter(j + 1) : 0;
    // The pictures never move: each new cover is revealed from the bottom edge upwards,
    // like a window that opens over the previous picture.
    item.style.clipPath = `inset(${((1 - e) * 100).toFixed(3)}% 0 0 0)`;
    item.style.visibility = e <= 0 || next >= 1 ? 'hidden' : 'visible';
    item.style.zIndex = String(j + 1);
    item.style.pointerEvents = j === current ? 'auto' : 'none';
    item.tabIndex = j === current ? 0 : -1;
  });
}

const queueReel = () => { if (!reelFrame) reelFrame = requestAnimationFrame(updateReel); };
window.addEventListener('scroll', queueReel, { passive: true });
window.addEventListener('resize', layoutReel);

/* ── Filter ────────────────────────────────────────────── */
function renderFilterbar() {
  const bar = $('#filterbar');
  CATEGORIES.forEach((c, i) => {
    if (i === 1) bar.append(el('span', { class: 'sep', text: '/', 'aria-hidden': 'true' }));
    const b = el('button', { type: 'button', 'data-filter': c.id, 'aria-pressed': String(c.id === state.filter), text: c.label });
    b.addEventListener('click', () => onFilter(c.id));
    bar.append(b);
  });
}

/* "All" is the home page (intro + scrolling reel); every other category opens its own grid of projects. */
function onFilter(id) {
  if (state.view !== HOME || !$('#project').hidden) location.hash = `#${HOME}`;
  applyFilter(id);
  setIndexMode(id === 'all' ? 'reel' : 'grid');
  goToContent(true);
}

function applyFilter(id) {
  state.filter = id;
  document.querySelectorAll('#filterbar button').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.filter === id));
  });

  let visible = 0;
  document.querySelectorAll('#view-index .idx-item').forEach((item) => {
    const match = id === 'all' || item.dataset.cats.split(' ').includes(id);
    item.classList.toggle('is-out', !match);
    item.classList.remove('is-in');
    if (!match) return;
    void item.offsetWidth; // restart entry animation
    item.classList.add('is-in');
    item.style.animationDelay = `${Math.min(visible, 6) * 60}ms`;
    visible += 1;
  });
}

/* ── Project overlay ───────────────────────────────────── */
function buildGallery(p) {
  const rows = p.cols
    ? Array.from({ length: Math.ceil(p.images.length / p.cols) }, (_, r) => p.images.slice(r * p.cols, (r + 1) * p.cols).map((__, k) => r * p.cols + k))
    : p.rows ?? p.images.map((_, i) => [i]);
  const grid = el('div', { class: `p-rows${p.cols ? ' has-cols' : ''}`, ...(p.cols ? { style: `--cols: ${p.cols}` } : {}) });
  rows.forEach((idx) => {
    const imgs = idx.map((i) => p.images[i]);
    const hasCaps = imgs.some((im) => im[3]);
    const row = el('div', { class: `p-row${hasCaps ? ' has-caps' : ''}${imgs.length === 1 && !p.cols ? ' is-solo' : ''}` });
    imgs.forEach((image, k) => {
      const [season, detail] = (image[3] ?? '').split(' — ');
      const picture = img(image, `${p.title} — ${season || `image ${idx[k] + 1}`}`, idx[0] === 0);
      const link = image[4];
      const fig = el('figure', { style: `--ar: ${(image[1] / image[2]).toFixed(4)}` }, [
        link ? el('a', { class: 'shoot-link', href: `#p/${link}`, 'aria-label': `${season || p.title} — voir tout le shooting` }, [picture]) : picture,
      ]);
      if (imgs.length === 1 && !p.cols) fig.style.maxWidth = `${image[1]}px`;
      if (image[3]) {
        fig.append(el('figcaption', {}, [
          el('span', { text: season }),
          ...(detail ? [el('br'), el('span', { class: 'mute', text: detail })] : []),
          ...(link ? [el('br'), el('a', { class: 'view-shoot', href: `#p/${link}`, text: 'View shoot →' })] : []),
        ]));
      }
      row.append(fig);
    });
    grid.append(row);
  });
  return grid;
}

function buildProject(p) {

  const credits = el('dl', { class: 'credits' });
  p.credits.forEach(([role, name]) => credits.append(el('dt', { text: role }), el('dd', { text: name })));

  const tagcol = el('div', { class: 'tagcol' }, [
    el('h1', { class: 'p-title', id: 'p-title', text: p.title }),
    el('p', { class: 'mute', text: [p.client, p.year].filter(Boolean).join(' — ') }),
    el('p', { class: 'mute', text: p.tag }),
  ]);

  return [
    el('div', { class: 'p-meta' }, [tagcol, el('p', { class: 'desc', text: p.desc }), credits]),
    buildGallery(p),
  ];
}

let revealObserver = null;
let closeTimer = null;
const CLOSE_MS = 950; // matches .project clip-path transition

function openProject(slug) {
  const index = PROJECTS.findIndex((p) => p.slug === slug);
  const project = index >= 0 ? PROJECTS[index] : SHOOTS.find((s) => s.slug === slug);
  if (!project) {
    location.hash = `#${HOME}`;
    return;
  }
  const overlay = $('#project');
  const inner = $('#p-inner');
  const wasOpen = overlay.classList.contains('is-open');

  // a shoot gallery remembers where its parent project was scrolled to
  if (project.parent && wasOpen) state.parentScroll = overlay.scrollTop;
  state.back = project.parent ? `#p/${project.parent}` : null;

  inner.replaceChildren(...buildProject(project));
  $('#p-count').textContent = project.parent
    ? SHOOTS.find((s) => s.slug === slug).title
    : `${pad(index)} / ${pad(PROJECTS.length - 1)}`;
  const restore = !project.parent && state.parentScroll != null;
  const startTop = restore ? state.parentScroll : 0;
  if (restore) state.parentScroll = null;
  document.title = `${project.title} — Alexane Vitte`;

  revealObserver?.disconnect();
  revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.classList.add('is-seen');
      revealObserver.unobserve(e.target);
    });
  }, { root: overlay, rootMargin: '0px 0px -8% 0px' });
  inner.querySelectorAll('.p-row img').forEach((im) => revealObserver.observe(im));

  if (!wasOpen) {
    overlay.hidden = false;
    requestAnimationFrame(() => { overlay.classList.add('is-open'); updateProjectEnd(); });
    document.body.classList.add('is-locked');
  }
  overlay.scrollTop = startTop; // after un-hiding, otherwise the browser keeps the previous scroll
  if (restore) requestAnimationFrame(() => { overlay.scrollTop = startTop; updateProjectEnd(); });
  updateProjectEnd();
  $('#p-close').focus({ preventScroll: true });
}

/* On project pages the filter menu only shows once the bottom of the page is reached. */
const projectEl = $('#project');
const updateProjectEnd = () => {
  const atEnd = projectEl.scrollTop + projectEl.clientHeight >= projectEl.scrollHeight - 60;
  document.body.classList.toggle('at-project-end', projectEl.classList.contains('is-open') && atEnd);
};
projectEl.addEventListener('scroll', updateProjectEnd, { passive: true });
window.addEventListener('resize', updateProjectEnd);
new ResizeObserver(updateProjectEnd).observe($('#p-inner'));

function closeProject() {
  const overlay = $('#project');
  if (overlay.hidden) return;
  overlay.classList.remove('is-open');
  document.body.classList.remove('is-locked', 'at-project-end');
  document.title = 'Alexane Vitte — Image & Creative Direction';
  // transitionend is unreliable here (bubbling child transitions, background tabs)
  clearTimeout(closeTimer);
  closeTimer = setTimeout(() => {
    if (!overlay.classList.contains('is-open')) overlay.hidden = true;
  }, CLOSE_MS);
  state.lastTrigger?.focus({ preventScroll: true });
}

/* ── Views & routing ───────────────────────────────────── */
function goToContent(smooth) {
  const behavior = smooth && !matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'auto';
  $('#main').scrollIntoView({ behavior });
}

function showView(view) {
  state.view = view;
  VIEWS.forEach((v) => { $(`#view-${v}`).hidden = v !== view; });
  document.querySelectorAll('.nav a').forEach((a) => {
    const active = a.dataset.view === view;
    a.classList.toggle('is-active', active);
    if (active) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  $('#filterbar').classList.toggle('is-hidden', view === 'info');
  if (view === HOME) layoutReel();
}

function route() {
  const hash = location.hash.replace(/^#/, '');
  if (hash.startsWith('p/')) {
    openProject(hash.slice(2));
    return;
  }
  closeProject();
  const view = VIEWS.includes(hash) ? hash : HOME;
  if (view !== state.view || !document.querySelector('.nav a.is-active')) {
    const first = !document.querySelector('.nav a.is-active');
    showView(view);
    if (first) window.scrollTo({ top: 0 });
    else goToContent(false);
  } else {
    $('#filterbar').classList.toggle('is-hidden', view === 'info');
  }
}

/* ── Init ──────────────────────────────────────────────── */
renderIndex();
renderFilterbar();
applyFilter('all');

document.addEventListener('click', (e) => {
  const link = e.target.closest('a[href^="#p/"]');
  if (link && !link.closest('#project')) state.lastTrigger = link;
});
const leaveProject = () => { location.hash = state.back ?? `#${state.view}`; };
$('#p-close').addEventListener('click', leaveProject);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('#project').hidden) leaveProject();
});

/* ── Landing: arrow scrolls to the index, UI chrome waits for it ── */
const landing = $('#landing');
document.querySelectorAll('.landing-wordmark, .landing .nav a').forEach((a) => a.addEventListener('click', (e) => {
  e.preventDefault();
  const target = a.dataset.view ?? HOME;
  if (target === HOME) { applyFilter('all'); setIndexMode('reel'); }
  if (location.hash !== `#${target}`) location.hash = `#${target}`;
  goToContent(true);
}));
new IntersectionObserver(([entry]) => {
  document.body.classList.toggle('on-landing', entry.intersectionRatio > 0.35);
}, { threshold: [0, 0.35, 0.36, 1] }).observe(landing);

/* Slightly slower, smoothed mouse-wheel / trackpad scrolling (touch keeps its native momentum). */
const WHEEL_SPEED = 0.7;   // 1 = native
const WHEEL_GLIDE = 150;  // ms: higher = longer, softer glide
if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const scroller = () => (projectEl.hidden ? document.scrollingElement : projectEl);
  let target = null;
  let current = 0;
  let active = null;
  let frame = 0;
  let last = 0;

  // frame-rate independent exponential smoothing, so 60 Hz and 120 Hz screens feel the same
  const step = (now) => {
    const dt = Math.min(64, now - last);
    last = now;
    frame = 0;
    if (!active) return;
    current += (target - current) * (1 - Math.exp(-dt / WHEEL_GLIDE));
    if (Math.abs(target - current) < 0.3) current = target;
    active.scrollTop = current;
    if (current !== target) frame = requestAnimationFrame(step);
    else target = null;
  };

  window.addEventListener('wheel', (e) => {
    if (e.ctrlKey || e.defaultPrevented || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    const el = scroller();
    if (active !== el || target === null) {
      active = el;
      current = el.scrollTop;
      target = current;
    }
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? el.clientHeight : 1;
    const max = el.scrollHeight - el.clientHeight;
    target = Math.min(max, Math.max(0, target + e.deltaY * unit * WHEEL_SPEED));
    e.preventDefault();
    if (!frame) { last = performance.now(); frame = requestAnimationFrame(step); }
  }, { passive: false });

  // anything else that scrolls (scrollbar drag, keyboard, in-page jumps) takes over from the animation
  const release = () => { if (!frame) target = null; };
  window.addEventListener('scroll', release, { passive: true });
  projectEl.addEventListener('scroll', release, { passive: true });
}

window.addEventListener('hashchange', route);
window.addEventListener('resize', fitWordmark);
document.fonts.ready.then(fitWordmark);
fitWordmark();
route();
if (location.hash && location.hash !== '#') goToContent(false);
