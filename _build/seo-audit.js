#!/usr/bin/env node
/**
 * What to Cook — SEO audit
 *
 * Checks article data against the rules we care about before anything ships.
 * publish-draft.js runs this on a draft and refuses to publish on any ERROR,
 * so a bad draft cannot reach the live site.
 *
 * Run: node _build/seo-audit.js            audit everything already published
 *      node _build/seo-audit.js <slug>     audit a single draft in _data/drafts/
 *      node _build/seo-audit.js --all      published + any pending drafts
 *
 * Exit code is 1 if there is at least one ERROR, otherwise 0. Warnings are
 * advisory — they are things to look at during review, not blockers.
 */

const fs   = require('fs');
const path = require('path');

const ROOT     = path.join(__dirname, '..');
const ARTICLES = JSON.parse(fs.readFileSync(path.join(ROOT, '_data/articles.json'), 'utf8'));

const REQUIRED = ['slug', 'title', 'meta_description', 'meta_keywords', 'category',
                  'read_time', 'intro', 'sections', 'cta_text'];

// Google truncates around these; the ranges are conventional SEO practice.
const META_MIN = 120, META_MAX = 160;
const TITLE_MAX = 60;
const WORDS_THIN = 800, WORDS_TOO_THIN = 400;

const errors = [];
const warns  = [];
const err  = (slug, msg) => errors.push(`${slug}: ${msg}`);
const warn = (slug, msg) => warns.push(`${slug}: ${msg}`);

const words = s => String(s || '').trim().split(/\s+/).filter(Boolean).length;

// Prose the reader actually sees, as one blob — used for the copy rules below.
function prose(a) {
  return [
    a.intro,
    a.quick_answer,
    a.cta_text,
    a.category,
    ...(a.sections || []).flatMap(s => [s.heading, s.body]),
    ...(a.key_takeaways || []),
    ...(a.faq || []).flatMap(q => [q.question, q.answer]),
  ].filter(Boolean).join('\n');
}

function auditOne(a, corpus) {
  const slug = a.slug || '(no slug)';

  // ── Structure ───────────────────────────────────────────────────────────
  const missing = REQUIRED.filter(k => !a[k]);
  if (missing.length) err(slug, `missing required field(s): ${missing.join(', ')}`);

  if (a.slug && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(a.slug)) {
    err(slug, 'slug must be lowercase alphanumeric words separated by single hyphens');
  }

  // ── Uniqueness across the whole corpus (duplicate titles cannibalise) ───
  const dupSlug  = corpus.filter(o => o !== a && o.slug === a.slug).length;
  const dupTitle = corpus.filter(o => o !== a && o.title === a.title).length;
  const dupMeta  = corpus.filter(o => o !== a && o.meta_description === a.meta_description).length;
  if (dupSlug)  err(slug, 'duplicate slug already exists');
  if (dupTitle) err(slug, 'duplicate title — two pages competing for the same query');
  if (dupMeta)  warn(slug, 'duplicate meta_description');

  // ── Meta ────────────────────────────────────────────────────────────────
  if (a.title && a.title.length > TITLE_MAX) {
    warn(slug, `title is ${a.title.length} chars, Google truncates near ${TITLE_MAX}`);
  }
  if (a.meta_description) {
    const n = a.meta_description.length;
    if (n < META_MIN || n > META_MAX) {
      warn(slug, `meta_description is ${n} chars, aim for ${META_MIN}-${META_MAX}`);
    }
  }

  // ── Date ────────────────────────────────────────────────────────────────
  if (a.published_date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(a.published_date)) {
      err(slug, `published_date "${a.published_date}" is not YYYY-MM-DD`);
    } else if (a.published_date > new Date().toISOString().slice(0, 10)) {
      err(slug, `published_date "${a.published_date}" is in the future`);
    }
  }

  // ── Depth ───────────────────────────────────────────────────────────────
  const wc = words(prose(a));
  if (wc < WORDS_TOO_THIN)  err(slug, `only ~${wc} words — too thin to rank, likely truncated`);
  else if (wc < WORDS_THIN) warn(slug, `~${wc} words, competitive nutrition queries usually need ${WORDS_THIN}+`);

  if ((a.sections || []).length < 3) warn(slug, `only ${(a.sections || []).length} section(s)`);

  // FAQPage schema only renders when faq exists, and it is what wins the
  // "People also ask" real estate for these queries.
  if (!a.faq || !a.faq.length) warn(slug, 'no faq[] — page forfeits FAQPage rich result');
  if (!a.key_takeaways || !a.key_takeaways.length) warn(slug, 'no key_takeaways[]');
  if (!a.quick_answer) warn(slug, 'no quick_answer — weakens the featured-snippet shot');

  // ── Hero image ──────────────────────────────────────────────────────────
  if (a.hero_image_url) {
    if (a.hero_image_url.includes('source.unsplash.com')) {
      err(slug, 'source.unsplash.com is a deprecated redirect API — use an images.unsplash.com/photo-* URL');
    } else if (!a.hero_image_url.startsWith('https://images.unsplash.com/photo-')) {
      warn(slug, 'hero_image_url is not an images.unsplash.com/photo-* URL');
    }
  } else {
    warn(slug, 'no hero_image_url — og:image and Article schema image will be empty');
  }

  // ── House copy rules (CLAUDE.md) ────────────────────────────────────────
  // "weekly menu", not "meal plan". Slug/title/meta_keywords are exempt:
  // those deliberately target what people actually type into Google.
  const mp = prose(a).match(/meal[- ]plans?/gi);
  if (mp) warn(slug, `"${mp[0]}" appears in body copy ${mp.length}x — house term is "weekly menu"`);

  if (/[‘’“”]/.test(JSON.stringify(a))) {
    warn(slug, 'contains curly quotes/apostrophes — straight ones only');
  }

  if (a.cta_text && !/weekly menu/i.test(a.cta_text)) {
    warn(slug, 'cta_text does not mention the weekly menu — weakens the internal link back to the app');
  }

  // ── Internal linking (mirrors generate.js relatedArticles scoring) ──────
  const kw = x => (x.meta_keywords || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const mine = kw(a);
  const scored = corpus.filter(o => o !== a && o.slug !== a.slug)
    .filter(o => (o.category === a.category ? 3 : 0) + kw(o).filter(k => mine.includes(k)).length > 0);
  if (!scored.length && corpus.length > 1) {
    warn(slug, 'no topical match for related links — only the newest-article fallback will link here');
  }
}

// ── Run ─────────────────────────────────────────────────────────────────────
const arg = process.argv[2];
let targets, label;

if (arg && arg !== '--all') {
  const draftPath = path.join(ROOT, '_data/drafts', `${arg}.json`);
  if (!fs.existsSync(draftPath)) {
    console.error(`No draft at _data/drafts/${arg}.json`);
    process.exit(1);
  }
  const draft = JSON.parse(fs.readFileSync(draftPath, 'utf8'));
  targets = [draft];
  label   = `draft "${arg}"`;
  // Audit the draft against the published corpus so duplicate-title and
  // related-link checks see the site it is about to join.
  targets.forEach(t => auditOne(t, ARTICLES.concat(targets)));
} else {
  const drafts = arg === '--all' && fs.existsSync(path.join(ROOT, '_data/drafts'))
    ? fs.readdirSync(path.join(ROOT, '_data/drafts')).filter(f => f.endsWith('.json'))
        .map(f => JSON.parse(fs.readFileSync(path.join(ROOT, '_data/drafts', f), 'utf8')))
    : [];
  const corpus = ARTICLES.concat(drafts);
  targets = corpus;
  label   = `${ARTICLES.length} published article(s)${drafts.length ? ` + ${drafts.length} draft(s)` : ''}`;
  targets.forEach(t => auditOne(t, corpus));
}

console.log(`\nSEO audit — ${label}\n`);

if (errors.length) {
  console.log(`ERRORS (${errors.length}) — these block publishing:`);
  errors.forEach(m => console.log(`  ✗ ${m}`));
  console.log('');
}
if (warns.length) {
  console.log(`WARNINGS (${warns.length}) — review, do not necessarily block:`);
  warns.forEach(m => console.log(`  ! ${m}`));
  console.log('');
}
if (!errors.length && !warns.length) console.log('Clean — no errors, no warnings.\n');

process.exit(errors.length ? 1 : 0);
