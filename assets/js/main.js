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
    de: {
      title: 'Ali Akgün — iOS-Apps & Chrome-Erweiterungen',
      description: 'Ali Akgün — Informatikingenieur und Softwareentwickler. Meine iOS-Apps und Chrome-Erweiterungen.',
      new: 'Neu',
      theme: { system: 'Design: System', light: 'Design: hell', dark: 'Design: dunkel' },
      results: (n) => `${n} Projekt${n === 1 ? '' : 'e'} angezeigt`,
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
    $$('.card, .support-card, .panel, .doc').forEach((el, i) => {
      el.classList.add('reveal');
      if (el.classList.contains('card')) el.style.setProperty('--i', i % 6);
      io.observe(el);
    });
  }

  // ---------------------------------------------------------------------------
  // Hero code window — types a snippet, pauses, deletes it, types the next.
  // ---------------------------------------------------------------------------
  const codeEl = $('#term-code code');
  const titleEl = $('#term-title');
  const langEl = $('#term-lang');
  const count = (kind) => cards.filter((c) => c.dataset.kind === kind).length;
  const HELLO = { tr: 'Zamanınızı size geri kazandırın', en: 'Give people their time back', de: 'Gib den Menschen ihre Zeit zurück' };

  const SNIPPETS = [
    {
      file: 'Developer.swift', lang: 'Swift',
      code: () => codeEl.dataset.initial,
    },
    {
      file: 'ContentView.swift', lang: 'SwiftUI',
      code: () => `import SwiftUI

struct ContentView: View {
    var body: some View {
        Text("${HELLO[lang]}")
            .font(.largeTitle.bold())
            .foregroundStyle(.tint)
    }
}`,
    },
    {
      file: 'zsh — ~/apps', lang: 'Shell', shell: true,
      code: () => `$ ls ~/apps | wc -l
${count('ios')}
$ git commit -m "feat: ship new release"
[main 4f2a9c1] feat: ship new release
$ fastlane ios release
✓ Uploaded to App Store Connect`,
    },
    {
      file: 'Portfolio.swift', lang: 'Swift',
      code: () => `// ${count('ios')} iOS apps · ${count('chrome')} Chrome extensions
let apps = try await AppStore.apps(by: "Ali Akgün")

for app in apps where app.rating >= 4.5 {
    print("★ \\(app.name)")
}`,
    },
  ];

  const SWIFT = /(\/\/.*$)|("(?:[^"\\\n]|\\.)*"?)|\b(struct|let|var|import|func|some|try|await|return|for|in|where|class)\b|\b([A-Z][A-Za-z]*)\b|(\.[a-zA-Z]+)|\b(\d+(?:\.\d+)?)\b/gm;
  const TOKEN_CLASS = [null, 'tk-c', 'tk-s', 'tk-k', 'tk-t', 'tk-f', 'tk-n'];

  function highlight(text, shell) {
    if (shell) {
      return text.split('\n').map((line) => {
        if (line.startsWith('$')) return `<span class="tk-p">$</span>${escapeHtml(line.slice(1)).replace(/(&quot;.*?(?:&quot;|$))/g, '<span class="tk-s">$1</span>')}`;
        if (line.startsWith('✓')) return `<span class="tk-ok">${escapeHtml(line)}</span>`;
        return `<span class="tk-c">${escapeHtml(line)}</span>`;
      }).join('\n');
    }
    let out = '';
    let last = 0;
    for (const m of text.matchAll(SWIFT)) {
      out += escapeHtml(text.slice(last, m.index));
      const group = m.findIndex((g, i) => i > 0 && g !== undefined);
      out += `<span class="${TOKEN_CLASS[group]}">${escapeHtml(m[0])}</span>`;
      last = m.index + m[0].length;
    }
    return out + escapeHtml(text.slice(last));
  }

  const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Only animate while the window is on screen and the tab is visible.
  let onScreen = true;
  let wake = null;
  const resumeIfVisible = () => { if (onScreen && !document.hidden && wake) { wake(); wake = null; } };
  const whenVisible = () => (onScreen && !document.hidden ? null : new Promise((r) => { wake = r; }));
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; resumeIfVisible(); }).observe(codeEl);
  }
  document.addEventListener('visibilitychange', resumeIfVisible);

  async function playCode() {
    codeEl.dataset.initial = codeEl.textContent;
    const caret = '<span class="caret"></span>';
    const typingCaret = '<span class="caret is-typing"></span>';
    const render = (text, shell, typing) => { codeEl.innerHTML = highlight(text, shell) + (typing ? typingCaret : caret); };

    await sleep(2500); // let people read the first snippet
    for (let i = 1; ; i = (i + 1) % SNIPPETS.length) {
      // Delete the current snippet, a few characters at a time.
      let text = codeEl.textContent;
      const prev = SNIPPETS[(i + SNIPPETS.length - 1) % SNIPPETS.length];
      while (text.length) {
        await whenVisible();
        text = text.slice(0, -3);
        render(text, prev.shell, true);
        await sleep(14);
      }

      const snippet = SNIPPETS[i];
      titleEl.textContent = snippet.file;
      langEl.textContent = snippet.lang;
      await sleep(350);

      // Type the next one. Shell output lines appear at once, like real output.
      const target = snippet.code();
      const lines = target.split('\n');
      text = '';
      for (const [n, line] of lines.entries()) {
        await whenVisible();
        if (n) text += '\n';
        if (snippet.shell && !line.startsWith('$')) {
          await sleep(320);
          text += line;
          render(text, true, true);
          continue;
        }
        for (const ch of line) {
          text += ch;
          render(text, snippet.shell, true);
          await sleep(ch === ' ' ? 20 : 28 + Math.random() * 45);
        }
        render(text, snippet.shell, true);
        await sleep(snippet.shell ? 260 : 90);
      }
      render(text, snippet.shell, false);
      await sleep(2600);
    }
  }

  if (!reducedMotion.matches) playCode();

  // ---------------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------------
  $('#year').textContent = new Date().getFullYear();
  for (const btn of $$('[data-set-lang]')) btn.addEventListener('click', () => applyLang(btn.dataset.setLang, true));
  applyLang(lang, false);
  setFilter(location.hash.slice(1));
})();
