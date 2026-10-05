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

  function setTheme(next) {
    if (next === 'system') delete root.dataset.theme;
    else root.dataset.theme = next;
    store.set('theme', next === 'system' ? null : next);
    updateThemeButton();
  }

  themeBtn.addEventListener('click', () => setTheme(THEMES[(THEMES.indexOf(currentTheme()) + 1) % THEMES.length]));

  // ---------------------------------------------------------------------------
  // Filtering & search
  // ---------------------------------------------------------------------------
  const cards = $$('.card');
  const search = $('#search');
  const empty = $('#empty');
  const status = $('#results-status');
  const filterBtns = $$('[data-filter]');
  const normalize = (s) => s.toLocaleLowerCase('tr').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i').replace(/['\u2019`]/g, '');
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
  // #ios / #chrome links (e.g. from the terminal) pick the filter and jump to the grid.
  addEventListener('hashchange', () => {
    const hash = location.hash.slice(1);
    if (!filterBtns.some((b) => b.dataset.filter === hash)) return;
    setFilter(hash);
    $('#projects').scrollIntoView();
  });
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
    $$('.card, .support-card').forEach((el, i) => {
      el.classList.add('reveal');
      if (el.classList.contains('card')) el.style.setProperty('--i', i % 6);
      io.observe(el);
    });
  }

  // ---------------------------------------------------------------------------
  // Terminal hero — the transcript is static HTML; on the first visit of a
  // session we "type" it out, then hand over an interactive prompt.
  // ---------------------------------------------------------------------------
  const term = {
    body: $('#term-body'),
    intro: $('#term-intro'),
    log: $('#term-log'),
    form: $('#term-form'),
    input: $('#term-input'),
    history: [],
    cursor: 0,
  };

  const TERM = {
    tr: {
      help: 'Kullanılabilir komutlar:',
      cmds: {
        help: 'bu listeyi gösterir',
        whoami: 'ben kimim?',
        about: 'hakkımda',
        ls: 'projeleri listeler',
        apps: 'iOS uygulamalarına gider',
        extensions: 'Chrome eklentilerine gider',
        open: 'open <isim> — projeyi mağazada açar',
        search: 'search <kelime> — projelerde arar',
        contact: 'iletişim bağlantıları',
        coffee: 'bana bir kahve ısmarla ☕',
        theme: 'theme light|dark|system',
        lang: 'lang tr|en',
        clear: 'ekranı temizler',
      },
      notFound: (c) => `zsh: komut bulunamadı: ${c} — 'help' yazmayı deneyin`,
      noMatch: (q) => `'${q}' ile eşleşen proje yok.`,
      opening: (n) => `${n} açılıyor…`,
      jumping: 'Projelere gidiliyor…',
      searching: (q, n) => `'${q}' için ${n} sonuç.`,
      themeSet: (v) => `Tema: ${v}`,
      langSet: 'Dil: Türkçe',
      usage: (u) => `kullanım: ${u}`,
      sudo: 'Bu olay rapor edilecek. 🙂',
      coffee: 'Teşekkürler! Buy Me a Coffee açılıyor…',
    },
    en: {
      help: 'Available commands:',
      cmds: {
        help: 'show this list',
        whoami: 'who am I?',
        about: 'about me',
        ls: 'list projects',
        apps: 'jump to iOS apps',
        extensions: 'jump to Chrome extensions',
        open: 'open <name> — open a project in its store',
        search: 'search <term> — search projects',
        contact: 'contact links',
        coffee: 'buy me a coffee ☕',
        theme: 'theme light|dark|system',
        lang: 'lang tr|en',
        clear: 'clear the screen',
      },
      notFound: (c) => `zsh: command not found: ${c} — try 'help'`,
      noMatch: (q) => `No project matches '${q}'.`,
      opening: (n) => `Opening ${n}…`,
      jumping: 'Jumping to projects…',
      searching: (q, n) => `${n} result(s) for '${q}'.`,
      themeSet: (v) => `Theme: ${v}`,
      langSet: 'Language: English',
      usage: (u) => `usage: ${u}`,
      sudo: 'This incident will be reported. 🙂',
      coffee: 'Thank you! Opening Buy Me a Coffee…',
    },
  };
  const tt = (k) => TERM[lang][k];
  const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const scrollTerm = () => { term.body.scrollTop = term.body.scrollHeight; };

  // Clone a line from the intro so outputs stay in sync with the static HTML (and its translations).
  const introLine = (sel) => $(sel, term.intro).cloneNode(true);
  const ps1 = $('.ps1', term.intro).outerHTML;

  function print(content, cls = 'out') {
    const el = typeof content === 'string' ? Object.assign(document.createElement('p'), { className: cls, innerHTML: content }) : content;
    term.log.append(el);
    scrollTerm();
  }

  const projectCards = () => cards.map((c) => ({
    card: c,
    name: $('.card-title', c).textContent.trim(),
    url: $('.store-link', c).href,
    kind: c.dataset.kind,
  }));

  function goToProjects(kind, query = '') {
    search.value = query;
    setFilter(kind);
    history.replaceState(null, '', kind === 'all' ? location.pathname + location.search : '#' + kind);
    $('#projects').scrollIntoView();
  }

  const COMMANDS = {
    help() {
      const rows = Object.entries(tt('cmds')).map(([k, v]) => `<dt>${k}</dt><dd>${escapeHtml(v)}</dd>`).join('');
      print(tt('help'), 'out out-muted');
      print(Object.assign(document.createElement('dl'), { className: 'out out-grid', innerHTML: rows }));
    },
    whoami() { print(introLine('.out-name')); print(introLine('.out-name + .out')); },
    about() { print(introLine('.out-about')); },
    cat([file = '']) { (file.startsWith('contact') ? COMMANDS.contact : COMMANDS.about)(); },
    ls(args) {
      const kind = /ios/.test(args[0]) ? 'ios' : /chrome|ext/.test(args[0]) ? 'chrome' : null;
      if (!kind) return print(introLine('.out-ls'));
      const items = projectCards().filter((p) => p.kind === kind);
      print(items.map((p) => `<a href="${escapeHtml(p.url)}" target="_blank" rel="noopener">${escapeHtml(p.name)}</a>`).join('<br>'));
    },
    apps() { print(tt('jumping'), 'out out-ok'); goToProjects('ios'); },
    extensions() { print(tt('jumping'), 'out out-ok'); goToProjects('chrome'); },
    projects() { print(tt('jumping'), 'out out-ok'); goToProjects('all'); },
    search(args) {
      const q = args.join(' ');
      if (!q) return print(tt('usage')('search <term>'), 'out out-warn');
      goToProjects('all', q);
      print(tt('searching')(escapeHtml(q), cards.filter((c) => !c.hidden).length), 'out out-ok');
    },
    open(args) {
      const q = normalize(args.join(' '));
      if (!q) return print(tt('usage')('open <name>'), 'out out-warn');
      const match = projectCards().find((p) => index.get(p.card).includes(q));
      if (!match) return print(tt('noMatch')(escapeHtml(args.join(' '))), 'out out-err');
      print(tt('opening')(escapeHtml(match.name)), 'out out-ok');
      window.open(match.url, '_blank', 'noopener');
    },
    contact() { print(introLine('.out-links')); },
    coffee() { print(tt('coffee'), 'out out-ok'); window.open('https://buymeacoffee.com/aliakgun', '_blank', 'noopener'); },
    theme([value]) {
      if (!THEMES.includes(value)) return print(tt('usage')('theme light|dark|system'), 'out out-warn');
      setTheme(value);
      print(tt('themeSet')(value), 'out out-ok');
    },
    lang([value]) {
      if (!LANGS.includes(value)) return print(tt('usage')('lang tr|en'), 'out out-warn');
      applyLang(value, true);
      print(tt('langSet'), 'out out-ok');
    },
    clear() { term.log.innerHTML = ''; term.intro.hidden = true; },
    sudo() { print(tt('sudo'), 'out out-err'); },
  };
  const ALIASES = { '?': 'help', cd: 'projects', ios: 'apps', ext: 'extensions', chrome: 'extensions', exit: 'clear', cls: 'clear', github: 'contact', linkedin: 'contact' };

  function run(raw) {
    const line = raw.trim();
    const echo = document.createElement('p');
    echo.className = 'cmd';
    echo.innerHTML = `${ps1} <span class="cmd-text"></span>`;
    $('.cmd-text', echo).textContent = line;
    print(echo);
    if (!line) return;
    term.history.push(line);
    term.cursor = term.history.length;
    const [name, ...args] = line.split(/\s+/);
    const cmd = COMMANDS[ALIASES[name.toLowerCase()] ?? name.toLowerCase()];
    if (cmd) cmd(args.map((a) => a.toLowerCase()));
    else print(tt('notFound')(escapeHtml(name)), 'out out-err');
  }

  term.form.addEventListener('submit', (e) => {
    e.preventDefault();
    run(term.input.value);
    term.input.value = '';
    $('.term-hint', term.form).hidden = true;
  });

  term.input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      term.cursor = Math.max(0, Math.min(term.history.length, term.cursor + (e.key === 'ArrowUp' ? -1 : 1)));
      term.input.value = term.history[term.cursor] ?? '';
    } else if (e.key === 'Tab') {
      const v = term.input.value.toLowerCase();
      const hits = Object.keys(COMMANDS).filter((c) => v && c.startsWith(v));
      if (hits.length) { e.preventDefault(); }
      if (hits.length === 1) term.input.value = hits[0] + ' ';
      else if (hits.length > 1) print(hits.join('  '), 'out out-muted');
    } else if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault();
      COMMANDS.clear();
    }
  });

  // Click anywhere in the terminal (except links / selected text) to focus the prompt.
  term.body.addEventListener('click', (e) => {
    const dir = e.target.closest('a[href^="#"]');
    if (dir && filterBtns.some((b) => '#' + b.dataset.filter === dir.getAttribute('href'))) {
      e.preventDefault();
      goToProjects(dir.getAttribute('href').slice(1));
      return;
    }
    if (e.target.closest('a') || getSelection().toString() || term.form.hidden) return;
    term.input.focus({ preventScroll: true });
  });

  async function playIntro() {
    const nodes = [...term.intro.children];
    const texts = nodes.map((n) => n.classList.contains('cmd') ? $('.cmd-text', n).textContent : null);
    let skipped = false;
    const skip = () => { skipped = true; };
    const wait = (ms) => (skipped ? null : sleep(ms));
    ['keydown', 'pointerdown', 'wheel', 'touchstart'].forEach((ev) => addEventListener(ev, skip, { once: true, passive: true }));

    nodes.forEach((n) => { n.hidden = true; });
    const caret = Object.assign(document.createElement('span'), { className: 'caret' });
    for (const [i, node] of nodes.entries()) {
      node.hidden = false;
      scrollTerm();
      if (texts[i] == null) { await wait(90); continue; }
      const out = $('.cmd-text', node);
      out.textContent = '';
      out.after(caret);
      await wait(380);
      for (const ch of texts[i]) {
        if (skipped) break;
        out.textContent += ch;
        await sleep(35 + Math.random() * 55);
      }
      out.textContent = texts[i];
      await wait(260);
    }
    caret.remove();
    nodes.forEach((n) => { n.hidden = false; });
  }

  (async () => {
    const animate = !reducedMotion.matches && !sessionStorageFlag();
    if (animate) await playIntro();
    term.form.hidden = false;
    if (animate) scrollTerm(); // otherwise keep `whoami` in view
  })();

  function sessionStorageFlag() {
    try {
      if (sessionStorage.getItem('term-played')) return true;
      sessionStorage.setItem('term-played', '1');
    } catch { /* storage blocked: just play */ }
    return false;
  }

  // ---------------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------------
  $('#year').textContent = new Date().getFullYear();
  for (const btn of $$('[data-set-lang]')) btn.addEventListener('click', () => applyLang(btn.dataset.setLang, true));
  applyLang(lang, false);
  setFilter(location.hash.slice(1));
})();
