import { PROJECTS, CATEGORIES } from './data.js?v=16';

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
const state = { view: HOME, filter: 'all', lastTrigger: null };

/* ── Wordmark: scale text to fill header width ─────────── */
function fitWordmark() {
  const text = $('#wordmark');
  const box = text.parentElement;
  text.style.fontSize = '100px';
  const ratio = box.clientWidth / text.scrollWidth;
  text.style.fontSize = `${Math.floor(100 * ratio * 1000) / 1000}px`;
}

/* ── Render: INDEX (numbered grid) ─────────────────────── */
function renderIndex() {
  const root = $('#view-index');
  PROJECTS.forEach((p, i) => {
    root.append(
      el('a', { class: 'idx-item', href: `#p/${p.slug}`, 'data-cats': p.cats.join(' ') }, [
        el('div', { class: 'frame' }, [img(p.cover ?? p.images[0], p.title, i < 3)]),
        el('div', { class: 'idx-cap' }, [
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

/* ── Filter ────────────────────────────────────────────── */
function renderFilterbar() {
  const bar = $('#filterbar');
  CATEGORIES.forEach((c, i) => {
    if (i === 1) bar.append(el('span', { class: 'sep', text: '/', 'aria-hidden': 'true' }));
    const b = el('button', { type: 'button', 'data-filter': c.id, 'aria-pressed': String(c.id === state.filter), text: c.label });
    b.addEventListener('click', () => applyFilter(c.id));
    bar.append(b);
  });
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
function buildGallery(images, title) {
  const gallery = el('div', { class: 'p-gallery' });
  const fig = (image, cls, i) => el('figure', { class: cls }, [img(image, `${title} — image ${i + 1}`, i === 0)]);

  gallery.append(fig(images[0], 'g-full', 0));
  for (let i = 1; i < images.length; i += 1) {
    const cur = images[i];
    const next = images[i + 1];
    if (isLandscape(cur)) {
      gallery.append(fig(cur, 'g-full', i));
    } else if (next && !isLandscape(next)) {
      gallery.append(fig(cur, 'g-pair-a', i), fig(next, 'g-pair-b', i + 1));
      i += 1;
    } else {
      gallery.append(fig(cur, 'g-solo', i));
    }
  }
  return gallery;
}

function buildProject(index) {
  const p = PROJECTS[index];

  const credits = el('dl', { class: 'credits' });
  p.credits.forEach(([role, name]) => credits.append(el('dt', { text: role }), el('dd', { text: name })));

  const tagcol = el('div', { class: 'tagcol' }, [
    el('h1', { class: 'p-title', id: 'p-title', text: p.title }),
    el('p', { class: 'mute', text: [p.client, p.year].filter(Boolean).join(' — ') }),
    el('p', { class: 'mute', text: p.tag }),
  ]);

  return [
    el('div', { class: 'p-meta' }, [tagcol, el('p', { class: 'desc', text: p.desc }), credits]),
    buildGallery(p.images, p.title),
  ];
}

let revealObserver = null;
let closeTimer = null;
const CLOSE_MS = 950; // matches .project clip-path transition

function openProject(slug) {
  const index = PROJECTS.findIndex((p) => p.slug === slug);
  if (index < 0) {
    location.hash = `#${HOME}`;
    return;
  }
  const overlay = $('#project');
  const inner = $('#p-inner');
  const wasOpen = overlay.classList.contains('is-open');

  inner.replaceChildren(...buildProject(index));
  $('#p-count').textContent = `${pad(index)} / ${pad(PROJECTS.length - 1)}`;
  overlay.scrollTop = 0;
  document.title = `${PROJECTS[index].title} — Alexane Vitte`;

  revealObserver?.disconnect();
  revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.classList.add('is-seen');
      revealObserver.unobserve(e.target);
    });
  }, { root: overlay, rootMargin: '0px 0px -8% 0px' });
  inner.querySelectorAll('.p-gallery img').forEach((im) => revealObserver.observe(im));

  if (!wasOpen) {
    overlay.hidden = false;
    requestAnimationFrame(() => overlay.classList.add('is-open'));
    document.body.classList.add('is-locked');
    $('#filterbar').classList.add('is-hidden');
  }
  $('#p-close').focus({ preventScroll: true });
}

function closeProject() {
  const overlay = $('#project');
  if (overlay.hidden) return;
  overlay.classList.remove('is-open');
  document.body.classList.remove('is-locked');
  document.title = 'Alexane Vitte — Image & Creative Direction';
  // transitionend is unreliable here (bubbling child transitions, background tabs)
  clearTimeout(closeTimer);
  closeTimer = setTimeout(() => {
    if (!overlay.classList.contains('is-open')) overlay.hidden = true;
  }, CLOSE_MS);
  state.lastTrigger?.focus({ preventScroll: true });
}

/* ── Views & routing ───────────────────────────────────── */
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
    showView(view);
    window.scrollTo({ top: 0 });
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
$('#p-close').addEventListener('click', () => { location.hash = `#${state.view}`; });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('#project').hidden) location.hash = `#${state.view}`;
});

window.addEventListener('hashchange', route);
window.addEventListener('resize', fitWordmark);
document.fonts.ready.then(fitWordmark);
fitWordmark();
route();
