#!/usr/bin/env node
// Builds the project grid in index.html from data/*.json.
//
//   node scripts/build.mjs          -> re-render from the JSON files already in data/
//   node scripts/build.mjs --sync   -> fetch the latest catalog from the App Store first
//
// No dependencies; needs Node 18+ (global fetch). Run by .github/workflows/sync-apps.yml.

import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHash } from 'node:crypto';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE_URL = 'https://akgunali.github.io/';
const LANGS = ['tr', 'en', 'de'];

const file = (p) => path.join(ROOT, p);
const readJson = async (p) => JSON.parse(await readFile(file(p), 'utf8'));
const writeJson = (p, data) => writeFile(file(p), JSON.stringify(data, null, 2) + '\n');

// ---------------------------------------------------------------------------
// App Store sync
// ---------------------------------------------------------------------------

async function itunesLookup(params, attempt = 1) {
  const url = 'https://itunes.apple.com/lookup?' + new URLSearchParams(params);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'akgunali.github.io catalog sync' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()).results ?? [];
  } catch (err) {
    if (attempt >= 4) throw new Error(`iTunes lookup failed (${url}): ${err.message}`);
    await new Promise((r) => setTimeout(r, 2 ** attempt * 1000));
    return itunesLookup(params, attempt + 1);
  }
}

async function resolveDeveloperId(cfg) {
  if (cfg.developerId) return cfg.developerId;
  for (const country of Object.values(cfg.storefronts)) {
    const [app] = await itunesLookup({ id: cfg.seedAppId, country });
    if (app?.artistId) return app.artistId;
  }
  throw new Error(`Could not resolve developer id from seedAppId ${cfg.seedAppId}`);
}

// mzstatic serves any size/format from the same path; 256px webp is plenty for a 72px icon.
const resizeArtwork = (url) => url?.replace(/\/\d+x\d+bb\.(png|jpe?g)$/, '/256x256bb.webp') ?? null;

async function syncAppStore(cfg, previous) {
  const developerId = await resolveDeveloperId(cfg);
  const byId = new Map();
  let developerName = previous.developer?.name;

  for (const lang of LANGS) {
    const country = cfg.storefronts[lang];
    const results = await itunesLookup({ id: developerId, entity: 'software', country, limit: 200 });
    for (const r of results) {
      if (r.wrapperType === 'artist') { developerName = r.artistName; continue; }
      if (r.wrapperType !== 'software') continue;
      const app = byId.get(r.trackId) ?? { id: r.trackId, ratings: [] };
      app.url = `https://apps.apple.com/app/id${r.trackId}`;
      app.icon ??= resizeArtwork(r.artworkUrl512 || r.artworkUrl100);
      app.released ??= r.releaseDate ?? null;
      app.updated = [app.updated, r.currentVersionReleaseDate].filter(Boolean).sort().pop() ?? null;
      app.version ??= r.version ?? null;
      app.price ??= r.price ?? null;
      if (r.userRatingCount) app.ratings.push([r.averageUserRating, r.userRatingCount]);
      app[lang] = { name: r.trackName, genre: r.primaryGenreName ?? null, description: r.description ?? '' };
      byId.set(r.trackId, app);
    }
  }

  if (byId.size === 0) throw new Error('App Store returned no apps; refusing to overwrite data/apps.json');

  const apps = [...byId.values()].map(({ ratings, ...app }) => {
    // Ratings are per storefront; combine them weighted by count.
    const count = ratings.reduce((n, [, c]) => n + c, 0);
    const rating = count ? ratings.reduce((s, [r, c]) => s + r * c, 0) / count : null;
    for (const lang of LANGS) app[lang] ??= app[LANGS.find((l) => app[l])];
    return { ...app, rating: rating && Math.round(rating * 10) / 10, ratingCount: count };
  });

  return {
    ...previous,
    syncedAt: new Date().toISOString(),
    developer: { id: developerId, name: developerName, url: `https://apps.apple.com/developer/id${developerId}` },
    apps,
  };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

// The iTunes API returns English genre names in every storefront.
const GENRES = {};
GENRES.tr = {
  Books: 'Kitaplar', Business: 'İş', 'Developer Tools': 'Geliştirici Araçları', Education: 'Eğitim',
  Entertainment: 'Eğlence', Finance: 'Finans', 'Food & Drink': 'Yemek ve İçecek', Games: 'Oyunlar',
  'Graphics & Design': 'Grafik ve Tasarım', 'Health & Fitness': 'Sağlık ve Fitness', Kids: 'Çocuklar',
  Lifestyle: 'Yaşam Tarzı', Magazines: 'Dergiler', Medical: 'Sağlık', Music: 'Müzik', Navigation: 'Navigasyon',
  News: 'Haberler', 'Photo & Video': 'Fotoğraf ve Video', Productivity: 'Verimlilik', Reference: 'Referans',
  Shopping: 'Alışveriş', 'Social Networking': 'Sosyal Ağ', Sports: 'Spor', Travel: 'Seyahat',
  Utilities: 'Araçlar', Weather: 'Hava Durumu',
};
GENRES.de = {
  Books: 'Bücher', Business: 'Wirtschaft', 'Developer Tools': 'Entwickler-Tools', Education: 'Bildung',
  Entertainment: 'Unterhaltung', Finance: 'Finanzen', 'Food & Drink': 'Essen und Trinken', Games: 'Spiele',
  'Graphics & Design': 'Grafik und Design', 'Health & Fitness': 'Gesundheit und Fitness', Kids: 'Kinder',
  Lifestyle: 'Lifestyle', Magazines: 'Zeitschriften', Medical: 'Medizin', Music: 'Musik', Navigation: 'Navigation',
  News: 'Nachrichten', 'Photo & Video': 'Foto und Video', Productivity: 'Produktivität', Reference: 'Nachschlagewerke',
  Shopping: 'Shopping', 'Social Networking': 'Soziale Netze', Sports: 'Sport', Travel: 'Reisen',
  Utilities: 'Dienstprogramme', Weather: 'Wetter',
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function firstSentence(text, max = 150) {
  const line = (text || '').split(/\n/).map((s) => s.trim()).find(Boolean) ?? '';
  const sentence = line.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? line;
  return sentence.length > max ? sentence.slice(0, max - 1).trimEnd() + '…' : sentence;
}

// { tr, en, de } for one field of a localized object, optionally formatted.
const pick = (obj, key, fmt = (v) => v) => Object.fromEntries(LANGS.map((l) => [l, fmt((obj[l] ?? obj.en)[key])]));

// Element whose text is swapped by the client when the language changes.
const i18n = (tag, cls, values) =>
  `<${tag} class="${cls}" ${LANGS.map((l) => `data-${l}="${esc(values[l])}"`).join(' ')}>${esc(values.tr)}</${tag}>`;

function toProjects(catalog, cfg, extensions) {
  const hidden = new Set(cfg.hidden.map(Number));
  const featured = cfg.featured.map(Number);
  const rank = (a) => (featured.includes(a.id) ? featured.indexOf(a.id) : Infinity);

  const apps = catalog.apps
    .filter((a) => !hidden.has(a.id))
    .map((a, i) => ({ ...a, order: i }))
    .sort((a, b) => rank(a) - rank(b) || (b.released ?? '').localeCompare(a.released ?? '') || a.order - b.order)
    .map((a) => {
      const o = cfg.overrides[a.id] ?? {};
      const text = Object.fromEntries(LANGS.map((l) => {
        const store = a[l] ?? a.en ?? a.tr; // a storefront may be missing until the next sync
        return [l, {
          name: o[l]?.name ?? store.name,
          tagline: o[l]?.tagline ?? firstSentence(store.description),
          genre: o[l]?.genre ?? GENRES[l]?.[store.genre] ?? store.genre,
        }];
      }));
      return { kind: 'ios', featured: featured.includes(a.id), ...a, ...text };
    });

  const exts = extensions.map((e) => ({ kind: 'chrome', ...e }));
  return [...apps, ...exts];
}

function renderCard(p) {
  const store = p.kind === 'ios'
    ? { icon: 'i-apple', tr: "App Store'da Gör", en: 'View on App Store', de: 'Im App Store ansehen' }
    : { icon: 'i-chrome', tr: "Web Store'da Gör", en: 'View on Chrome Web Store', de: 'Im Chrome Web Store ansehen' };
  const search = LANGS.flatMap((l) => [p[l].name, p[l].tagline, p[l].genre]).filter(Boolean).join(' ').toLowerCase();
  const genre = p.tr.genre ? i18n('span', 'chip', pick(p, 'genre')) : '';
  const platform = `<span class="chip chip-platform"><svg aria-hidden="true"><use href="#${store.icon}"/></svg>${p.kind === 'ios' ? 'iOS' : 'Chrome'}</span>`;
  const rating = p.ratingCount
    ? `<span class="rating" title="${p.ratingCount}"><svg aria-hidden="true"><use href="#i-star"/></svg>${p.rating.toFixed(1)} <small>(${p.ratingCount})</small></span>`
    : '';

  return `
      <article class="card${p.featured ? ' is-featured' : ''}" data-kind="${p.kind}" data-search="${esc(search)}"${p.released ? ` data-released="${esc(p.released)}"` : ''}>
        <div class="card-head">
          <img class="card-icon${p.kind === 'chrome' ? ' is-ext' : ''}" src="${esc(p.icon)}" alt="" width="72" height="72" loading="lazy" decoding="async">
          <div class="card-meta">${platform}${genre}</div>
        </div>
        ${i18n('h3', 'card-title', pick(p, 'name'))}
        ${i18n('p', 'card-desc', pick(p, 'tagline'))}
        <div class="card-foot">
          ${rating}
          <a class="store-link" href="${esc(p.url)}" target="_blank" rel="noopener">
            <svg aria-hidden="true"><use href="#${store.icon}"/></svg>
            ${i18n('span', '', store)}
            ${i18n('span', 'sr-only', pick(p, 'name', (v) => `— ${v}`))}
            <svg class="arrow" aria-hidden="true"><use href="#i-arrow"/></svg>
          </a>
        </div>
      </article>`;
}

// ---------------------------------------------------------------------------
// Documents — every file in Documents/ is listed; data/documents.json adds titles/order.
// ---------------------------------------------------------------------------

const DOWNLOAD = { tr: 'İndir: ', en: 'Download: ', de: 'Herunterladen: ' };

const DOC_ICONS = { cv: 'i-file', diploma: 'i-cap', transcript: 'i-file', certificate: 'i-award' };

const formatSize = (bytes) => (bytes >= 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1e3))} KB`);

async function loadDocuments() {
  const cfg = await readJson('data/documents.json');
  let files;
  try { files = (await readdir(file('Documents'))).filter((f) => !f.startsWith('.')); } catch { return []; }
  files = files.filter((f) => !cfg.exclude.includes(f));
  // onRequest items are credentials listed without a file: anything in Documents/ is public.
  const known = cfg.items.filter((i) => i.onRequest || files.includes(i.file));
  const unknown = files.filter((f) => !cfg.items.some((i) => i.file === f)).sort().map((f) => {
    const title = f.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
    return { file: f, kind: 'other', ...Object.fromEntries(LANGS.map((l) => [l, { title, desc: '' }])) };
  });
  return Promise.all([...known, ...unknown].map(async (d) => d.onRequest ? d : ({
    ...d,
    ext: path.extname(d.file).slice(1).toUpperCase(),
    size: formatSize((await stat(file(`Documents/${d.file}`))).size),
  })));
}

const ON_REQUEST = { tr: 'Talep üzerine paylaşılır', en: 'Available on request', de: 'Auf Anfrage erhältlich' };
const REQUEST = { tr: 'Talep et', en: 'Request', de: 'Anfragen' };
const REQUEST_URL = 'https://www.linkedin.com/in/akgunali/';

function renderDocument(d) {
  if (d.onRequest) {
    return `
        <article class="doc">
          <span class="doc-icon" aria-hidden="true"><svg><use href="#${DOC_ICONS[d.kind] ?? 'i-file'}"/></svg></span>
          <div class="doc-body">
            ${i18n('h3', 'doc-title', pick(d, 'title'))}
            ${d.tr.desc ? i18n('p', 'doc-desc', pick(d, 'desc')) : ''}
            <p class="doc-meta doc-private"><svg aria-hidden="true"><use href="#i-lock"/></svg>${i18n('span', '', ON_REQUEST)}</p>
          </div>
          <div class="doc-actions">
            <a class="btn btn-ghost btn-sm" href="${REQUEST_URL}" target="_blank" rel="noopener">${i18n('span', '', REQUEST)}${i18n('span', 'sr-only', pick(d, 'title', (v) => `: ${v}`))}</a>
          </div>
        </article>`;
  }
  const href = esc('Documents/' + encodeURIComponent(d.file));
  return `
        <article class="doc">
          <span class="doc-icon" aria-hidden="true"><svg><use href="#${DOC_ICONS[d.kind] ?? 'i-file'}"/></svg></span>
          <div class="doc-body">
            ${i18n('h3', 'doc-title', pick(d, 'title'))}
            ${d.tr.desc ? i18n('p', 'doc-desc', pick(d, 'desc')) : ''}
            <p class="doc-meta">${esc(d.ext)} · ${esc(d.size)}</p>
          </div>
          <div class="doc-actions">
            <a class="btn btn-ghost btn-sm" href="${href}" target="_blank" rel="noopener">${i18n('span', '', { tr: 'Görüntüle', en: 'View', de: 'Ansehen' })}${i18n('span', 'sr-only', pick(d, 'title', (v) => `: ${v}`))}</a>
            <a class="icon-btn" href="${href}" download ${LANGS.map((l) => `data-${l}="${esc(DOWNLOAD[l] + d[l].title)}"`).join(' ')} data-attr="aria-label" aria-label="${esc(DOWNLOAD.tr + d.tr.title)}"><svg aria-hidden="true"><use href="#i-download"/></svg></a>
          </div>
        </article>`;
}

function renderJsonLd(projects) {
  const person = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: 'Ali Akgün',
    url: SITE_URL,
    jobTitle: 'Software Developer',
    sameAs: ['https://www.linkedin.com/in/akgunali/', 'https://github.com/AkgunAli', 'https://buymeacoffee.com/aliakgun'],
    owns: projects.map((p) => ({
      '@type': 'SoftwareApplication',
      name: p.en.name,
      description: p.en.tagline,
      url: p.url,
      image: p.icon,
      operatingSystem: p.kind === 'ios' ? 'iOS' : 'Chrome',
      applicationCategory: p.kind === 'ios' ? 'MobileApplication' : 'BrowserApplication',
      ...(p.ratingCount ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: p.rating, ratingCount: p.ratingCount } } : {}),
    })),
  };
  return `<script type="application/ld+json">${JSON.stringify(person).replace(/</g, '\\u003c')}</script>`;
}

function replaceBlock(html, name, content) {
  const re = new RegExp(`(<!-- build:${name} -->)[\\s\\S]*?(<!-- /build:${name} -->)`);
  if (!re.test(html)) throw new Error(`Marker build:${name} not found in index.html`);
  return html.replace(re, `$1${content}\n      $2`);
}

// ---------------------------------------------------------------------------

const cfg = await readJson('data/appstore.json');
let catalog = await readJson('data/apps.json');
const extensions = await readJson('data/extensions.json');

if (process.argv.includes('--sync')) {
  const next = await syncAppStore(cfg, catalog);
  // Keep syncedAt stable when nothing else changed, so the workflow doesn't commit daily noise.
  const strip = ({ syncedAt, ...rest }) => JSON.stringify(rest);
  if (strip(next) !== strip(catalog)) {
    catalog = next;
    await writeJson('data/apps.json', catalog);
    console.log(`Synced ${catalog.apps.length} apps from the App Store (developer ${catalog.developer.id}).`);
  } else {
    console.log('App Store catalog unchanged.');
  }
}

const projects = toProjects(catalog, cfg, extensions);
const counts = { all: projects.length, ios: projects.filter((p) => p.kind === 'ios').length, chrome: projects.filter((p) => p.kind === 'chrome').length };

let html = await readFile(file('index.html'), 'utf8');
html = replaceBlock(html, 'projects', projects.map(renderCard).join(''));
html = replaceBlock(html, 'jsonld', '\n  ' + renderJsonLd(projects));
const documents = await loadDocuments();
html = replaceBlock(html, 'documents', documents.map(renderDocument).join(''));
for (const [k, v] of Object.entries(counts)) html = html.replace(new RegExp(`(data-count="${k}">)\\d*(<)`), `$1${v}$2`);
html = html.replace(/(<strong data-stat="apps">)\d*(<)/, `$1${counts.ios}$2`).replace(/(<strong data-stat="ext">)\d*(<)/, `$1${counts.chrome}$2`);
// Cache-busting: browsers (and GitHub Pages' 10-minute cache) must never pair new HTML with old CSS/JS.
for (const asset of ['assets/css/main.css', 'assets/js/main.js']) {
  const hash = createHash('sha256').update(await readFile(file(asset))).digest('hex').slice(0, 10);
  html = html.replace(new RegExp(`(${asset.replace(/[.]/g, '\\.')})\\?v=[\\w]*`, 'g'), `$1?v=${hash}`);
}
await writeFile(file('index.html'), html);

const lastmod = (catalog.syncedAt ?? new Date().toISOString()).slice(0, 10);
await writeFile(file('sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${SITE_URL}</loc><lastmod>${lastmod}</lastmod></url>
</urlset>
`);

console.log(`Rendered ${counts.ios} apps, ${counts.chrome} extensions and ${documents.length} documents into index.html.`);
