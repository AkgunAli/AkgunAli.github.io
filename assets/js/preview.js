// Preview design (onizleme.html): language switching, cursor spotlight,
// active-section nav, project filter and the looping code window.
(() => {
  'use strict';

  const root = document.documentElement;
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
  const store = {
    get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  };
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  root.classList.add('js');

  // ---------------------------------------------------------------------------
  // i18n — every translatable element carries data-tr / data-en / data-de.
  // ---------------------------------------------------------------------------
  const TITLES = { tr: 'Ali Akgün — Önizleme', en: 'Ali Akgün — Preview', de: 'Ali Akgün — Vorschau' };
  const NEW = { tr: 'Yeni', en: 'New', de: 'Neu' };
  const LANGS = Object.keys(TITLES);
  let lang = LANGS.includes(root.lang) ? root.lang : 'tr';

  function applyLang(next, persist) {
    lang = next;
    root.lang = lang;
    for (const el of $$('[data-' + lang + ']')) {
      const value = el.dataset[lang];
      if (el.dataset.attr) el.setAttribute(el.dataset.attr, value);
      else el.textContent = value;
    }
    for (const btn of $$('[data-set-lang]')) btn.setAttribute('aria-pressed', String(btn.dataset.setLang === lang));
    for (const badge of $$('.pv-new')) badge.textContent = NEW[lang];
    document.title = TITLES[lang];
    if (persist) store.set('lang', lang);
  }

  // ---------------------------------------------------------------------------
  // Cursor spotlight
  // ---------------------------------------------------------------------------
  const spot = $('.pv-spot');
  if (matchMedia('(hover: hover)').matches) {
    let frame = 0;
    addEventListener('pointermove', (e) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        spot.style.setProperty('--x', `${e.clientX}px`);
        spot.style.setProperty('--y', `${e.clientY}px`);
      });
    }, { passive: true });
  }

  // ---------------------------------------------------------------------------
  // Left nav follows the section in view
  // ---------------------------------------------------------------------------
  const navLinks = $$('.pv-nav a');
  const sections = navLinks.map((a) => $(a.getAttribute('href')));
  function updateNav() {
    const y = innerHeight * 0.35;
    let current = sections[0];
    for (const s of sections) if (s.getBoundingClientRect().top <= y) current = s;
    // At the very bottom the last section is current even if it is short.
    if (innerHeight + scrollY >= document.documentElement.scrollHeight - 4) current = sections[sections.length - 1];
    navLinks.forEach((a, i) => a.classList.toggle('is-active', sections[i] === current));
  }
  addEventListener('scroll', updateNav, { passive: true });
  addEventListener('resize', updateNav);

  // ---------------------------------------------------------------------------
  // Projects — filter chips and "show all"
  // ---------------------------------------------------------------------------
  const cards = $$('.pv-project');
  const filterBtns = $$('[data-filter]');
  const moreBtn = $('#pv-more');
  const LIMIT = 6;
  let filter = 'all';
  let expanded = false;

  function applyFilter() {
    let shown = 0;
    for (const card of cards) {
      const match = filter === 'all' || card.dataset.kind === filter;
      const visible = match && (expanded || filter !== 'all' || shown < LIMIT);
      card.hidden = !visible;
      if (match) shown++;
    }
    moreBtn.hidden = expanded || filter !== 'all' || shown <= LIMIT;
  }
  for (const b of filterBtns) {
    b.addEventListener('click', () => {
      filter = b.dataset.filter;
      for (const x of filterBtns) x.setAttribute('aria-pressed', String(x === b));
      applyFilter();
    });
  }
  moreBtn.addEventListener('click', () => { expanded = true; applyFilter(); });

  // "New" badge for apps released in the last 90 days.
  for (const card of cards) {
    const released = Date.parse(card.dataset.released);
    if (released && Date.now() - released < 90 * 864e5) {
      const badge = Object.assign(document.createElement('span'), { className: 'pv-new' });
      $('.pv-link', card).after(badge);
    }
  }

  // ---------------------------------------------------------------------------
  // Reveal on scroll
  // ---------------------------------------------------------------------------
  if ('IntersectionObserver' in window && !reducedMotion.matches) {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
    }, { rootMargin: '0px 0px -10% 0px' });
    $$('.pv-item, .term, .pv-skills').forEach((el, i) => {
      el.classList.add('pv-reveal');
      el.style.setProperty('--i', i % 4);
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
  applyFilter();
  updateNav();
})();
