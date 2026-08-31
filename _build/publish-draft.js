#!/usr/bin/env node
/**
 * Merges a reviewed article draft into _data/articles.json, marks the
 * matching topic_backlog.json entry as published, rebuilds the static
 * site, and removes the draft file.
 *
 * Run: node _build/publish-draft.js <slug>
 * (slug matches the filename in _data/drafts/<slug>.json)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const slug = process.argv[2];

if (!slug) {
  console.error('Usage: node _build/publish-draft.js <slug>');
  process.exit(1);
}

const draftPath = path.join(ROOT, '_data/drafts', `${slug}.json`);
if (!fs.existsSync(draftPath)) {
  console.error(`No draft found at _data/drafts/${slug}.json`);
  process.exit(1);
}

const draft = JSON.parse(fs.readFileSync(draftPath, 'utf8'));

const REQUIRED = ['slug', 'title', 'meta_description', 'meta_keywords', 'category', 'read_time', 'intro', 'sections', 'cta_text'];
const missing = REQUIRED.filter(k => !draft[k]);
if (missing.length) {
  console.error(`Draft is missing required fields: ${missing.join(', ')}`);
  process.exit(1);
}

const articlesPath = path.join(ROOT, '_data/articles.json');
const articles = JSON.parse(fs.readFileSync(articlesPath, 'utf8'));

if (articles.some(a => a.slug === draft.slug)) {
  console.error(`An article with slug "${draft.slug}" already exists in _data/articles.json`);
  process.exit(1);
}

if (!draft.published_date) {
  draft.published_date = new Date().toISOString().slice(0, 10);
}

articles.unshift(draft);
fs.writeFileSync(articlesPath, JSON.stringify(articles, null, 2) + '\n', 'utf8');
console.log(`Added "${draft.title}" to _data/articles.json`);

const backlogPath = path.join(ROOT, '_data/topic_backlog.json');
if (fs.existsSync(backlogPath)) {
  const backlog = JSON.parse(fs.readFileSync(backlogPath, 'utf8'));
  const entry = backlog.find(t => t.id === draft.slug);
  if (entry) {
    entry.status = 'published';
    fs.writeFileSync(backlogPath, JSON.stringify(backlog, null, 2) + '\n', 'utf8');
    console.log(`Marked backlog topic "${entry.id}" as published`);
  }
}

fs.unlinkSync(draftPath);
console.log('Removed draft file');

console.log('\nRebuilding site...');
execSync(`node "${path.join(__dirname, 'generate.js')}"`, { stdio: 'inherit', cwd: ROOT });

console.log(`\nDone. Review the diff, then:\n  git add . && git commit -m "Add article: ${draft.title}" && git push`);
