#!/usr/bin/env node
// Builds the project grid in index.html from data/*.json.
//
//   node scripts/build.mjs          -> re-render from the JSON files already in data/
//   node scripts/build.mjs --sync   -> fetch the latest catalog from the App Store first
//
// No dependencies; needs Node 18+ (global fetch). Run by .github/workflows/sync-apps.yml.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE_URL = 'https://akgunali.github.io/';
const LANGS = ['tr', 'en'];

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

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function firstSentence(text, max = 150) {
  const line = (text || '').split(/\n/).map((s) => s.trim()).find(Boolean) ?? '';
  const sentence = line.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? line;
  return sentence.length > max ? sentence.slice(0, max - 1).trimEnd() + '…' : sentence;
}

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
      const text = Object.fromEntries(LANGS.map((l) => [l, {
        name: o[l]?.name ?? a[l].name,
        tagline: o[l]?.tagline ?? firstSentence(a[l].description),
        genre: o[l]?.genre ?? a[l].genre,
      }]));
      return { kind: 'ios', featured: featured.includes(a.id), ...a, ...text };
    });

  const exts = extensions.map((e) => ({ kind: 'chrome', ...e }));
  return [...apps, ...exts];
}

function renderCard(p) {
  const store = p.kind === 'ios'
    ? { icon: 'i-apple', tr: "App Store'da Gör", en: 'View on App Store' }
    : { icon: 'i-chrome', tr: "Web Store'da Gör", en: 'View on Chrome Web Store' };
  const search = LANGS.flatMap((l) => [p[l].name, p[l].tagline, p[l].genre]).filter(Boolean).join(' ').toLowerCase();
  const genre = p.tr.genre ? i18n('span', 'chip', { tr: p.tr.genre, en: p.en.genre }) : '';
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
        ${i18n('h3', 'card-title', { tr: p.tr.name, en: p.en.name })}
        ${i18n('p', 'card-desc', { tr: p.tr.tagline, en: p.en.tagline })}
        <div class="card-foot">
          ${rating}
          <a class="store-link" href="${esc(p.url)}" target="_blank" rel="noopener">
            <svg aria-hidden="true"><use href="#${store.icon}"/></svg>
            ${i18n('span', '', store)}
            ${i18n('span', 'sr-only', { tr: `— ${p.tr.name}`, en: `— ${p.en.name}` })}
            <svg class="arrow" aria-hidden="true"><use href="#i-arrow"/></svg>
          </a>
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
for (const [k, v] of Object.entries(counts)) html = html.replace(new RegExp(`(data-count="${k}">)\\d*(<)`), `$1${v}$2`);
html = html.replace(/(<strong data-stat="apps">)\d*(<)/, `$1${counts.ios}$2`).replace(/(<strong data-stat="ext">)\d*(<)/, `$1${counts.chrome}$2`);
await writeFile(file('index.html'), html);

const lastmod = (catalog.syncedAt ?? new Date().toISOString()).slice(0, 10);
await writeFile(file('sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${SITE_URL}</loc><lastmod>${lastmod}</lastmod></url>
</urlset>
`);

console.log(`Rendered ${counts.ios} apps and ${counts.chrome} extensions into index.html.`);
