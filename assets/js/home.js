// Homepage: language switching, cursor spotlight,
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
  const TITLES = {
    tr: 'Ali Akgün — Senior iOS Geliştirici',
    en: 'Ali Akgün — Senior iOS Developer',
    de: 'Ali Akgün — Senior iOS-Entwickler',
  };
  const DESCRIPTIONS = {
    tr: 'Ali Akgün — Senior iOS geliştirici ve bilgisayar mühendisi. iOS uygulamalarım, web sitelerim ve Chrome eklentilerim.',
    en: 'Ali Akgün — Senior iOS developer and computer engineer. My iOS apps, websites and Chrome extensions.',
    de: 'Ali Akgün — Senior iOS-Entwickler und Informatikingenieur. Meine iOS-Apps, Websites und Chrome-Erweiterungen.',
  };
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
    $('meta[name="description"]').content = DESCRIPTIONS[lang];
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

  const STOP = Symbol("stop");
  async function playCode() {
    try { await demoLoop(); } catch (e) { if (e !== STOP) throw e; }
  }

  async function demoLoop() {
    codeEl.dataset.initial = codeEl.textContent;
    const caret = '<span class="caret"></span>';
    const typingCaret = '<span class="caret is-typing"></span>';
    const nap = async (ms) => { await sleep(ms); if (interactive) throw STOP; };
    const render = (text, shell, typing) => { codeEl.innerHTML = highlight(text, shell) + (typing ? typingCaret : caret); };

    await nap(2500); // let people read the first snippet
    for (let i = 1; ; i = (i + 1) % SNIPPETS.length) {
      // Delete the current snippet, a few characters at a time.
      let text = codeEl.textContent;
      const prev = SNIPPETS[(i + SNIPPETS.length - 1) % SNIPPETS.length];
      while (text.length) {
        await whenVisible(); if (interactive) throw STOP;
        text = text.slice(0, -3);
        render(text, prev.shell, true);
        await nap(14);
      }

      const snippet = SNIPPETS[i];
      titleEl.textContent = snippet.file;
      langEl.textContent = snippet.lang;
      await nap(350);

      // Type the next one. Shell output lines appear at once, like real output.
      const target = snippet.code();
      const lines = target.split('\n');
      text = '';
      for (const [n, line] of lines.entries()) {
        await whenVisible(); if (interactive) throw STOP;
        if (n) text += '\n';
        if (snippet.shell && !line.startsWith('$')) {
          await nap(320);
          text += line;
          render(text, true, true);
          continue;
        }
        for (const ch of line) {
          text += ch;
          render(text, snippet.shell, true);
          await nap(ch === ' ' ? 20 : 28 + Math.random() * 45);
        }
        render(text, snippet.shell, true);
        await nap(snippet.shell ? 260 : 90);
      }
      render(text, snippet.shell, false);
      await nap(2600);
    }
  }

  // ---------------------------------------------------------------------------
  // Interactive terminal — visitors can type commands (or tap the example
  // chips). The first interaction stops the demo loop; `demo` restarts it.
  // ---------------------------------------------------------------------------
  const termEl = $('#term');
  const preEl = $('#term-code');
  const formEl = $('#term-form');
  const inputEl = $('#term-input');
  const srEl = $('#term-sr');
  const initialHTML = codeEl.innerHTML;
  let interactive = false;
  let busy = false;
  let skip = false;
  const termLog = [];
  const cmdHistory = [];
  let historyPos = 0;

  const T = {
    tr: {
      welcome: "Merhaba! 👋 Bir komut yaz ya da aşağıdaki örneklerden birine dokun. Tüm komutlar için 'yardım'.",
      notFound: (c) => `zsh: komut bulunamadı: ${c} — 'yardım' yazmayı dene`,
      analyzing: 'Portföy analiz ediliyor…',
      keys: { ios: 'iOS uygulaması', web: 'web sitesi', chrome: 'Chrome eklentisi', rating: 'ortalama puan', reviews: 'toplam değerlendirme', newest: 'en yeni', top: 'en çok değerlendirilen', exp: 'deneyim', langs: 'diller' },
      exp: '5+ yıl iOS',
      langs: ['Türkçe', 'English', 'Deutsch'],
      verdict: (n) => `// sonuç: zamanınızı geri kazandıran ${n} proje ✓`,
      projectsMore: '→ Detaylar aşağıda, Projeler bölümünde.',
      whoami: 'Ali Akgün — Senior iOS Geliştirici · Singen, Almanya',
      demo: 'Demo moduna dönülüyor…',
      help: [
        ['analiz et', 'portföyü canlı analiz eder'],
        ['swift', 'örnek bir SwiftUI kodu yazar'],
        ['projeler', 'tüm uygulama ve siteleri listeler'],
        ['iletişim', 'bağlantılar'],
        ['ben kimim', 'kısaca ben'],
        ['temizle', 'ekranı temizler'],
        ['demo', 'animasyona geri döner'],
      ],
    },
    en: {
      welcome: "Hi! 👋 Type a command or tap one of the examples below. 'help' lists everything.",
      notFound: (c) => `zsh: command not found: ${c} — try 'help'`,
      analyzing: 'Analyzing portfolio…',
      keys: { ios: 'iOS apps', web: 'websites', chrome: 'Chrome extensions', rating: 'average rating', reviews: 'total reviews', newest: 'newest', top: 'most reviewed', exp: 'experience', langs: 'languages' },
      exp: '5+ years of iOS',
      langs: ['Turkish', 'English', 'German'],
      verdict: (n) => `// result: ${n} projects that give you your time back ✓`,
      projectsMore: '→ Details below, in the Projects section.',
      whoami: 'Ali Akgün — Senior iOS Developer · Singen, Germany',
      demo: 'Back to demo mode…',
      help: [
        ['analyze', 'analyzes the portfolio live'],
        ['swift', 'writes a sample SwiftUI view'],
        ['projects', 'lists all apps and sites'],
        ['contact', 'links'],
        ['whoami', 'me, in one line'],
        ['clear', 'clears the screen'],
        ['demo', 'back to the animation'],
      ],
    },
    de: {
      welcome: "Hallo! 👋 Gib einen Befehl ein oder tippe auf ein Beispiel unten. 'hilfe' zeigt alle Befehle.",
      notFound: (c) => `zsh: Befehl nicht gefunden: ${c} — versuch 'hilfe'`,
      analyzing: 'Portfolio wird analysiert…',
      keys: { ios: 'iOS-Apps', web: 'Websites', chrome: 'Chrome-Erweiterungen', rating: 'Durchschnittsbewertung', reviews: 'Bewertungen gesamt', newest: 'neueste', top: 'meistbewertet', exp: 'Erfahrung', langs: 'Sprachen' },
      exp: '5+ Jahre iOS',
      langs: ['Türkisch', 'Englisch', 'Deutsch'],
      verdict: (n) => `// Ergebnis: ${n} Projekte, die Ihnen Zeit zurückgeben ✓`,
      projectsMore: '→ Details unten im Bereich Projekte.',
      whoami: 'Ali Akgün — Senior iOS-Entwickler · Singen, Deutschland',
      demo: 'Zurück zum Demo-Modus…',
      help: [
        ['analysieren', 'analysiert das Portfolio live'],
        ['swift', 'schreibt eine SwiftUI-Beispielansicht'],
        ['projekte', 'listet alle Apps und Websites'],
        ['kontakt', 'Links'],
        ['whoami', 'ich, in einer Zeile'],
        ['löschen', 'leert den Bildschirm'],
        ['demo', 'zurück zur Animation'],
      ],
    },
  };
  const ALIASES = {
    analyze: ['analiz et', 'analiz', 'analyze', 'analyse', 'analysieren', 'analysiere'],
    swift: ['swift', 'swift örneği', 'swift ornegi', 'swift example', 'swift-beispiel', 'kod', 'code', 'beispiel'],
    projects: ['projeler', 'projects', 'projekte', 'ls'],
    contact: ['iletişim', 'iletisim', 'contact', 'kontakt'],
    whoami: ['whoami', 'ben kimim', 'kimim', 'wer bin ich'],
    clear: ['temizle', 'clear', 'cls', 'löschen', 'loschen'],
    demo: ['demo'],
    help: ['yardım', 'yardim', 'help', 'hilfe', '?'],
  };
  const fold = (s) => s.toLocaleLowerCase(lang).trim().replace(/\s+/g, ' ');
  const resolve = (raw) => Object.keys(ALIASES).find((k) => ALIASES[k].some((a) => fold(a) === fold(raw)));
  const t2 = () => T[lang];
  const pause = (ms) => (skip || reducedMotion.matches ? Promise.resolve() : sleep(ms));

  function show(current, typing) {
    const parts = current == null ? termLog : [...termLog, current];
    codeEl.innerHTML = parts.join('\n') + (typing ? '<span class="caret is-typing"></span>' : '');
    preEl.scrollTop = preEl.scrollHeight;
  }
  const line = (html) => { termLog.push(html); if (termLog.length > 300) termLog.splice(0, termLog.length - 300); show(); };
  const dim = (text) => `<span class="term-dim">${escapeHtml(text)}</span>`;

  // Types `text` with syntax highlighting, then keeps it in the log.
  async function typeOut(text, speed = 9) {
    let cur = '';
    for (const ch of text) {
      cur += ch;
      if (!skip) show(highlight(cur, false), true);
      if (ch !== ' ') await pause(speed);
    }
    line(highlight(cur, false));
  }

  function portfolio() {
    const items = cards.map((c) => {
      const m = ($('.pv-rating', c)?.textContent ?? '').match(/([\d.]+)\s*\((\d+)\)/);
      return {
        kind: c.dataset.kind,
        name: $('.pv-link span', c).textContent.trim(),
        released: c.dataset.released ?? '',
        rating: m ? Number(m[1]) : 0,
        reviews: m ? Number(m[2]) : 0,
      };
    });
    const reviews = items.reduce((n, i) => n + i.reviews, 0);
    const avg = reviews ? items.reduce((s, i) => s + i.rating * i.reviews, 0) / reviews : 0;
    const newest = items.filter((i) => i.released).sort((a, b) => b.released.localeCompare(a.released))[0];
    const top = [...items].sort((a, b) => b.reviews - a.reviews)[0];
    return { items, reviews, avg, newest, top };
  }

  const COMMANDS = {
    async analyze() {
      const s = t2();
      const p = portfolio();
      line(`<span class="tk-p">▸</span> ${escapeHtml(s.analyzing)}`);
      for (let pct = 0; pct <= 100; pct += 10) {
        const filled = Math.round(pct / 5);
        show(`<span class="term-ok">[${'█'.repeat(filled)}${'░'.repeat(20 - filled)}]</span> ${pct}%`, false);
        await pause(70);
      }
      line(`<span class="term-ok">[${'█'.repeat(20)}]</span> 100%`);
      const k = s.keys;
      const n = (kind) => p.items.filter((i) => i.kind === kind).length;
      const json = [
        '{',
        `  "${k.ios}": ${n('ios')},`,
        `  "${k.web}": ${n('web')},`,
        `  "${k.chrome}": ${n('chrome')},`,
        `  "${k.rating}": "★ ${p.avg.toFixed(1)}",`,
        `  "${k.reviews}": ${p.reviews},`,
        `  "${k.newest}": "${p.newest?.name ?? '-'}",`,
        `  "${k.top}": "${p.top ? `${p.top.name} (${p.top.reviews})` : '-'}",`,
        `  "${k.exp}": "${s.exp}",`,
        `  "${k.langs}": [${s.langs.map((l) => `"${l}"`).join(', ')}]`,
        '}',
      ].join('\n');
      await typeOut(json, 6);
      line(`<span class="term-ok">${escapeHtml(s.verdict(p.items.length))}</span>`);
      return json;
    },
    async swift() {
      const code = `struct AppCard: View {
    let app: App

    var body: some View {
        HStack(spacing: 12) {
            AsyncImage(url: app.icon)
                .frame(width: 56, height: 56)
                .clipShape(.rect(cornerRadius: 12))
            VStack(alignment: .leading) {
                Text(app.name).font(.headline)
                Text("★ \\(app.rating, specifier: "%.1f")")
            }
        }
    }
}`;
      titleEl.textContent = 'AppCard.swift';
      langEl.textContent = 'SwiftUI';
      await typeOut(code, 14);
      return code;
    },
    async projects() {
      const p = portfolio();
      const label = { ios: 'iOS', web: 'Web', chrome: 'Chrome' };
      for (const i of p.items) {
        line(`<span class="tk-f">•</span> ${escapeHtml(i.name)} ${dim(`(${label[i.kind]})`)}`);
        await pause(35);
      }
      line(dim(t2().projectsMore));
      return p.items.map((i) => i.name).join(', ');
    },
    async contact() {
      const links = [
        ['github', 'https://github.com/AkgunAli', 'github.com/AkgunAli'],
        ['linkedin', 'https://www.linkedin.com/in/akgunali/', 'linkedin.com/in/akgunali'],
        ['coffee', 'https://buymeacoffee.com/aliakgun', 'buymeacoffee.com/aliakgun'],
      ];
      for (const [k, href, text] of links) {
        line(`<span class="tk-k">${k.padEnd(9)}</span>→ <a href="${href}" target="_blank" rel="noopener">${text}</a>`);
        await pause(60);
      }
      return links.map((l) => l[2]).join(', ');
    },
    async whoami() { line(escapeHtml(t2().whoami)); return t2().whoami; },
    async help() {
      for (const [cmd, desc] of t2().help) line(`  <span class="tk-p">${escapeHtml(cmd.padEnd(13))}</span>${dim(desc)}`);
      return t2().help.map((h) => h[0]).join(', ');
    },
    async clear() { termLog.length = 0; show(); return ''; },
    async demo() {
      line(dim(t2().demo));
      await pause(500);
      leaveInteractive();
      return t2().demo;
    },
  };

  function enterInteractive() {
    if (interactive) return;
    interactive = true;
    termEl.classList.add('is-live');
    termLog.length = 0;
    titleEl.textContent = 'zsh — ~';
    langEl.textContent = 'zsh';
    line(dim(t2().welcome));
  }

  function leaveInteractive() {
    interactive = false;
    termEl.classList.remove('is-live');
    termLog.length = 0;
    codeEl.innerHTML = initialHTML;
    titleEl.textContent = 'Developer.swift';
    langEl.textContent = 'Swift';
    if (!reducedMotion.matches) playCode();
  }

  async function runCommand(raw) {
    const cmd = raw.trim();
    if (!cmd) return;
    if (busy) { skip = true; while (busy) await sleep(20); }
    enterInteractive();
    busy = true;
    skip = false;
    cmdHistory.push(cmd);
    historyPos = cmdHistory.length;
    line(`<span class="tk-p">$</span> ${escapeHtml(cmd)}`);
    const key = resolve(cmd);
    let said;
    if (key) {
      said = await COMMANDS[key]();
    } else {
      said = t2().notFound(cmd);
      line(`<span class="term-err">${escapeHtml(said)}</span>`);
    }
    if (srEl) srEl.textContent = said ?? '';
    busy = false;
    skip = false;
  }

  formEl.addEventListener('submit', (e) => {
    e.preventDefault();
    const value = inputEl.value;
    inputEl.value = '';
    runCommand(value);
  });
  inputEl.addEventListener('focus', enterInteractive);
  inputEl.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    historyPos = Math.max(0, Math.min(cmdHistory.length, historyPos + (e.key === 'ArrowUp' ? -1 : 1)));
    inputEl.value = cmdHistory[historyPos] ?? '';
  });
  // Clicking anywhere in the window focuses the prompt (links keep working).
  $('.term-body', termEl).addEventListener('click', (e) => {
    if (!e.target.closest('a') && !getSelection().toString()) inputEl.focus({ preventScroll: true });
  });

  // Example chips: the command is typed into the prompt, then run.
  for (const chip of $$('.term-chip')) {
    chip.addEventListener('click', async () => {
      const cmd = chip.textContent.trim();
      enterInteractive();
      inputEl.value = '';
      for (const ch of cmd) { inputEl.value += ch; await pause(45); }
      await pause(150);
      inputEl.value = '';
      runCommand(cmd);
    });
  }

  if (!reducedMotion.matches) playCode();

  // ---------------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------------
  $('#year').textContent = new Date().getFullYear();
  for (const btn of $$('[data-set-lang]')) btn.addEventListener('click', () => applyLang(btn.dataset.setLang, true));
  applyLang(lang, false);
  const hashFilter = filterBtns.find((b) => '#' + b.dataset.filter === location.hash);
  if (hashFilter) { hashFilter.click(); $('#projects').scrollIntoView(); } else applyFilter();
  updateNav();
})();
