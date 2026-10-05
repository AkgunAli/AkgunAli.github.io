// Progressive enhancement: the page is fully rendered HTML; this adds
// language/theme switching, filtering, search and motion.
(() => {
  'use strict';

  const root = document.documentElement;
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
  const store = {
    get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* private mode */ } },
  };
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

  root.classList.add('js');

  // ---------------------------------------------------------------------------
  // i18n — every translatable element carries data-tr / data-en.
  // ---------------------------------------------------------------------------
  const STRINGS = {
    tr: {
      title: 'Ali Akgün — iOS Uygulamaları & Chrome Eklentileri',
      description: 'Ali Akgün — Bilgisayar mühendisi ve yazılım geliştirici. Geliştirdiğim iOS uygulamaları ve Chrome eklentileri.',
      new: 'Yeni',
      theme: { system: 'Tema: sistem', light: 'Tema: açık', dark: 'Tema: koyu' },
      results: (n) => `${n} proje gösteriliyor`,
    },
    en: {
      title: 'Ali Akgün — iOS Apps & Chrome Extensions',
      description: 'Ali Akgün — Computer engineer and software developer. iOS apps and Chrome extensions I have built.',
      new: 'New',
      theme: { system: 'Theme: system', light: 'Theme: light', dark: 'Theme: dark' },
      results: (n) => `${n} project${n === 1 ? '' : 's'} shown`,
    },
  };
  const LANGS = Object.keys(STRINGS);
  let lang = LANGS.includes(root.lang) ? root.lang : 'tr';
  const t = (k) => STRINGS[lang][k];

  function applyLang(next, persist) {
    lang = next;
    root.lang = lang;
    for (const el of $$('[data-' + lang + ']')) {
      const value = el.dataset[lang];
      if (el.dataset.attr) el.setAttribute(el.dataset.attr, value);
      else el.textContent = value;
    }
    for (const btn of $$('[data-set-lang]')) btn.setAttribute('aria-pressed', String(btn.dataset.setLang === lang));
    document.title = t('title');
    $('meta[name="description"]').content = t('description');
    for (const badge of $$('.chip-new')) badge.textContent = t('new');
    updateThemeButton();
    if (persist) {
      store.set('lang', lang);
      const url = new URL(location.href);
      url.searchParams.delete('lang');
      history.replaceState(null, '', url);
    }
  }

  // ---------------------------------------------------------------------------
  // Theme — cycles system → light → dark; "system" follows the OS live.
  // ---------------------------------------------------------------------------
  const THEMES = ['system', 'light', 'dark'];
  const ICONS = { system: '#i-monitor', light: '#i-sun', dark: '#i-moon' };
  const themeBtn = $('#theme-toggle');
  const currentTheme = () => root.dataset.theme || 'system';

  function updateThemeButton() {
    const theme = currentTheme();
    $('use', themeBtn).setAttribute('href', ICONS[theme]);
    themeBtn.setAttribute('aria-label', t('theme')[theme]);
    themeBtn.title = t('theme')[theme];
  }

  themeBtn.addEventListener('click', () => {
    const next = THEMES[(THEMES.indexOf(currentTheme()) + 1) % THEMES.length];
    if (next === 'system') delete root.dataset.theme;
    else root.dataset.theme = next;
    store.set('theme', next === 'system' ? null : next);
    updateThemeButton();
  });

  // ---------------------------------------------------------------------------
  // Filtering & search
  // ---------------------------------------------------------------------------
  const cards = $$('.card');
  const search = $('#search');
  const empty = $('#empty');
  const status = $('#results-status');
  const filterBtns = $$('[data-filter]');
  const normalize = (s) => s.toLocaleLowerCase('tr').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i');
  const index = new Map(cards.map((c) => [c, normalize(c.dataset.search || c.textContent)]));
  let filter = 'all';

  function applyFilter() {
    const terms = normalize(search.value.trim()).split(/\s+/).filter(Boolean);
    let shown = 0;
    for (const card of cards) {
      const visible = (filter === 'all' || card.dataset.kind === filter) && terms.every((term) => index.get(card).includes(term));
      card.hidden = !visible;
      if (visible) shown++;
    }
    empty.hidden = shown > 0;
    status.textContent = t('results')(shown);
  }

  function setFilter(next) {
    filter = filterBtns.some((b) => b.dataset.filter === next) ? next : 'all';
    for (const b of filterBtns) b.setAttribute('aria-pressed', String(b.dataset.filter === filter));
    applyFilter();
  }

  for (const b of filterBtns) {
    b.addEventListener('click', () => {
      setFilter(b.dataset.filter);
      history.replaceState(null, '', filter === 'all' ? location.pathname + location.search : '#' + filter);
    });
  }
  search.addEventListener('input', applyFilter);
  search.addEventListener('keydown', (e) => { if (e.key === 'Escape') { search.value = ''; applyFilter(); search.blur(); } });

  document.addEventListener('keydown', (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
    if (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey) { e.preventDefault(); search.focus(); }
  });

  // ---------------------------------------------------------------------------
  // Cards — "new" badge, pointer spotlight
  // ---------------------------------------------------------------------------
  const NEW_DAYS = 90;
  for (const card of cards) {
    const released = Date.parse(card.dataset.released);
    if (released && Date.now() - released < NEW_DAYS * 864e5) {
      const badge = document.createElement('span');
      badge.className = 'chip chip-new';
      $('.card-meta', card).prepend(badge);
    }
    card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${e.clientX - r.left}px`);
      card.style.setProperty('--my', `${e.clientY - r.top}px`);
    });
  }

  // ---------------------------------------------------------------------------
  // Scroll effects
  // ---------------------------------------------------------------------------
  const nav = $('.nav');
  const onScroll = () => nav.classList.toggle('is-scrolled', scrollY > 8);
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  if ('IntersectionObserver' in window && !reducedMotion.matches) {
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      }
    }, { rootMargin: '0px 0px -8% 0px' });
    $$('.card, .support-card, .stats').forEach((el, i) => {
      el.classList.add('reveal');
      if (el.classList.contains('card')) el.style.setProperty('--i', i % 6);
      io.observe(el);
    });
  }

  // ---------------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------------
  $('#year').textContent = new Date().getFullYear();
  for (const btn of $$('[data-set-lang]')) btn.addEventListener('click', () => applyLang(btn.dataset.setLang, true));
  applyLang(lang, false);
  setFilter(location.hash.slice(1));
})();
