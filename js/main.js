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
  document.querySelectorAll('.wordmark-text').forEach((text) => {
    const box = text.parentElement;
    if (!box.clientWidth) return; // hidden view: fitted again when shown
    text.style.fontSize = '100px';
    const ratio = box.clientWidth / text.scrollWidth;
    text.style.fontSize = `${Math.floor(100 * ratio * 1000) / 1000}px`;
  });
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
  // the reel's scroll runway lives in its own track, so the mosaic of all projects can follow it
  root.append(el('div', { class: 'reel-track' }, [stage]), grid);
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
const ease = (t) => { const k = t * t * (3 - 2 * t); return t * 0.75 + k * 0.25; };  // nearly linear so the bands stay evenly spaced
const REEL_OVERLAP = 1.7;    // how many "slots" of scroll a cover takes to slide in (>1 = several layers in flight at once)
const REEL_STEP = 0.55;     // screens of scrolling per slot
const REEL_SPANS = [1.2, 0.85, 1.25, 1.1, 1.15, 0.9];   // each cover opens over its own length, so the bands get different heights
const REEL_PEEKS = [0.2, 0.34, 0.38, 0.34, 0.22, 0.3]; // share of the screen (from the bottom) where the next picture always shows
const reelSpan = (j) => REEL_OVERLAP * REEL_SPANS[j % REEL_SPANS.length];
const reelPeek = (j) => REEL_PEEKS[j % REEL_PEEKS.length];
const reelUnits = (n) => { let u = n - 1; for (let j = 1; j < n; j++) u = Math.max(u, j - 1 + reelSpan(j)); return u; };
let reelFrame = 0;

function layoutReel() {
  const root = $('#view-index');
  const n = root.querySelectorAll('.reel-item').length;
  const stage = root.querySelector('.reel-stage');
  const track = root.querySelector('.reel-track');
  if (state.indexMode === 'reel') {
    const units = reelUnits(n);
    track.style.height = `${Math.round(stage.offsetHeight * (1 + units * REEL_STEP))}px`;
  } else {
    track.style.height = '';
  }
  updateReel();
}

function updateReel() {
  reelFrame = 0;
  const root = $('#view-index');
  if (root.hidden || state.indexMode !== 'reel') return;
  const items = [...root.querySelectorAll('.reel-item')];
  const stage = root.querySelector('.reel-stage');
  const track = root.querySelector('.reel-track');
  const total = Math.max(1, track.offsetHeight - stage.offsetHeight);
  const scrolled = -track.getBoundingClientRect().top;
  const units = reelUnits(items.length);
  const progress = Math.min(1, Math.max(0, scrolled / total)) * units;
  const raw = (j) => (j <= 0 ? 1 : ease(Math.min(1, Math.max(0, (progress - (j - 1)) / reelSpan(j)))));
  // a sliver of the next picture always shows at the bottom edge, so two pictures are visible together even at rest
  const enter = (j) => (j <= 0 ? 1 : Math.max(raw(j), j === 1 || raw(j - 1) > 0.02 ? reelPeek(j) * Math.min(1, raw(j - 1) * 4) : 0));
  let current = 0;
  items.forEach((item, j) => { if (enter(j) >= 0.5) current = j; });
  items.forEach((item, j) => {
    const e = enter(j);
    const next = j + 1 < items.length ? raw(j + 1) : 0;
    // The pictures never move: each new cover is revealed from the bottom edge upwards,
    // like a window that opens over the previous picture.
    item.style.clipPath = `inset(${((1 - e) * 100).toFixed(3)}% 0 0 0)`;
    item.style.visibility = e <= 0 || next >= 1 ? 'hidden' : 'visible';
    // depth: the picture being covered dims and drifts up slightly under the one opening over it
    item.style.setProperty('--dim', (next * 0.5).toFixed(3));
    item.firstElementChild.style.transform = next > 0 ? `translate3d(0, ${(-next * 4).toFixed(3)}%, 0)` + ` scale(${(1 + next * 0.05).toFixed(4)})` : '';
    item.style.zIndex = String(j + 1);
    // every visible band is clickable (clip-path also clips hit-testing, so each one opens its own project)
    item.style.pointerEvents = e > 0 && next < 1 ? 'auto' : 'none';
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
  rows.forEach((idx, r) => {
    const imgs = idx.map((i) => p.images[i]);
    const hasCaps = imgs.some((im) => im[3]);
    const pair = imgs.length === 2 && (p.pairRows ?? []).includes(r);
    const row = el('div', { class: `p-row${hasCaps ? ' has-caps' : ''}${imgs.length === 1 && !p.cols ? ' is-solo' : ''}${pair ? ' is-pair' : ''}` });
    imgs.forEach((image, k) => {
      const [season, detail] = (image[3] ?? '').split(' — ');
      const picture = img(image, `${p.title} — ${season || `image ${idx[k] + 1}`}`, idx[0] === 0);
      const link = image[4];
      const film = image[5];   // HLS playlist of a film shown when the picture is clicked
      const fig = el('figure', { style: `--ar: ${(image[1] / image[2]).toFixed(4)}` }, [
        link ? el('a', { class: 'shoot-link', href: `#p/${link}`, 'aria-label': `${season || p.title} — voir tout le shooting` }, [picture])
          : film ? el('button', { class: 'video-link', type: 'button', 'data-film': film, 'aria-label': `${season || p.title} — lire le film` }, [picture, el('span', { class: 'play', 'aria-hidden': 'true', text: '▶' })])
            : picture,
      ]);
      if (imgs.length === 1 && !p.cols) fig.style.maxWidth = `${image[1]}px`;
      if (image[3]) {
        fig.append(el('figcaption', {}, [
          el('span', { text: season }),
          ...(detail ? [el('br'), el('span', { class: 'mute', text: detail })] : []),
          ...(link ? [el('br'), el('a', { class: 'view-shoot', href: `#p/${link}`, text: 'View shoot →' })] : []),
          ...(film ? [el('br'), el('button', { class: 'view-shoot', type: 'button', 'data-film': film, text: 'Watch film →' })] : []),
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
  if (view === 'info') fitWordmark();
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
  if (e.key === 'Escape' && !$('#project').hidden && $('#lightbox').hidden && $('#filmbox')?.hidden !== false) leaveProject();
});

/* ── Lightbox: click any gallery picture to see it full page, click again to zoom ── */
const lightbox = el('div', { class: 'lightbox', id: 'lightbox', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Image en plein écran', hidden: '' }, [
  el('div', { class: 'lb-scroll' }, [el('img', { class: 'lb-img', alt: '', draggable: 'false' })]),
  el('button', { class: 'lb-close', type: 'button', 'aria-label': 'Fermer', text: '×' }),
  el('button', { class: 'lb-nav lb-prev', type: 'button', 'aria-label': 'Image précédente', text: '←' }),
  el('button', { class: 'lb-nav lb-next', type: 'button', 'aria-label': 'Image suivante', text: '→' }),
  el('span', { class: 'lb-count' }),
]);
document.body.append(lightbox);
const lbScroll = lightbox.querySelector('.lb-scroll');
const lbImg = lightbox.querySelector('.lb-img');
let lbList = [];
let lbIndex = 0;

const lbShow = (i) => {
  lbIndex = (i + lbList.length) % lbList.length;
  const src = lbList[lbIndex];
  lbImg.src = src.currentSrc || src.src;
  lbImg.alt = src.alt;
  lightbox.classList.remove('is-zoomed');
  lbScroll.scrollTo(0, 0);
  lightbox.querySelector('.lb-count').textContent = `${lbIndex + 1} / ${lbList.length}`;
  lightbox.classList.toggle('is-single', lbList.length < 2);
};
const lbOpen = (target) => {
  lbList = [...$('#p-inner').querySelectorAll('figure img')].filter((im) => !im.closest('.shoot-link, .video-link'));
  const i = lbList.indexOf(target);
  if (i < 0) return;
  lightbox.hidden = false;
  document.body.classList.add('lb-open');
  lbShow(i);
};
const lbClose = () => {
  lightbox.hidden = true;
  lightbox.classList.remove('is-zoomed');
  document.body.classList.remove('lb-open');
};
$('#p-inner').addEventListener('click', (e) => {
  const picture = e.target.closest('figure img');
  if (picture && !picture.closest('.shoot-link, .video-link')) lbOpen(picture);
});
lbImg.addEventListener('click', (e) => {
  const wasZoomed = lightbox.classList.contains('is-zoomed');
  const r = lbImg.getBoundingClientRect();
  const fx = (e.clientX - r.left) / r.width;
  const fy = (e.clientY - r.top) / r.height;
  lightbox.classList.toggle('is-zoomed', !wasZoomed);
  if (wasZoomed) { lbScroll.scrollTo(0, 0); return; }
  // zoom in on the spot that was clicked
  requestAnimationFrame(() => {
    lbScroll.scrollTo(fx * lbImg.offsetWidth - lbScroll.clientWidth / 2, fy * lbImg.offsetHeight - lbScroll.clientHeight / 2);
  });
});
lbScroll.addEventListener('click', (e) => { if (e.target === lbScroll && !lightbox.classList.contains('is-zoomed')) lbClose(); });
lightbox.querySelector('.lb-close').addEventListener('click', lbClose);
lightbox.querySelector('.lb-prev').addEventListener('click', () => lbShow(lbIndex - 1));
lightbox.querySelector('.lb-next').addEventListener('click', () => lbShow(lbIndex + 1));
document.addEventListener('keydown', (e) => {
  if (lightbox.hidden) return;
  if (e.key === 'Escape') lbClose();
  else if (e.key === 'ArrowLeft') lbShow(lbIndex - 1);
  else if (e.key === 'ArrowRight') lbShow(lbIndex + 1);
});
window.addEventListener('hashchange', lbClose);

/* ── Film player: a click on a picture linked to a film plays it full screen (HLS, light segments) ── */
const filmbox = el('div', { class: 'filmbox', id: 'filmbox', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Film', hidden: '' }, [
  el('video', { class: 'film', controls: '', playsinline: '', preload: 'none' }),
  el('button', { class: 'lb-close', type: 'button', 'aria-label': 'Fermer', text: '×' }),
]);
document.body.append(filmbox);
const filmEl = filmbox.querySelector('video');
let hls = null;
const HLS_LIB = 'https://cdnjs.cloudflare.com/ajax/libs/hls.js/1.5.13/hls.min.js';
const loadHls = () => new Promise((ok, fail) => {
  if (window.Hls) return ok(window.Hls);
  const sc = el('script', { src: HLS_LIB });
  sc.onload = () => ok(window.Hls); sc.onerror = fail; document.head.append(sc);
});
async function filmOpen(src) {
  filmbox.hidden = false;
  document.body.classList.add('lb-open');
  let done = false;
  try {
    const Hls = await loadHls();
    if (Hls.isSupported()) { hls = new Hls(); hls.loadSource(src); hls.attachMedia(filmEl); done = true; }
  } catch { /* offline or blocked: try the browser's own HLS player */ }
  if (!done) filmEl.src = src;
  filmEl.play().catch(() => {});
}
function filmClose() {
  filmEl.pause();
  if (hls) { hls.destroy(); hls = null; }
  filmEl.removeAttribute('src'); filmEl.load();
  filmbox.hidden = true;
  document.body.classList.remove('lb-open');
}
$('#p-inner').addEventListener('click', (e) => {
  const b = e.target.closest('[data-film]');
  if (b) filmOpen(b.dataset.film);
});
filmbox.querySelector('.lb-close').addEventListener('click', filmClose);
filmbox.addEventListener('click', (e) => { if (e.target === filmbox) filmClose(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !filmbox.hidden) filmClose(); });
window.addEventListener('hashchange', () => { if (!filmbox.hidden) filmClose(); });

/* ── Landing: arrow scrolls to the index, UI chrome waits for it ── */
const landing = $('#landing');
document.querySelectorAll('.landing-wordmark, .landing .nav a, .info-head .nav a').forEach((a) => a.addEventListener('click', (e) => {
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
const WHEEL_SPEED = 1.0;   // 1 = native
const WHEEL_GLIDE = 120;  // ms: higher = longer, softer glide
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
