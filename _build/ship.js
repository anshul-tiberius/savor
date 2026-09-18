#!/usr/bin/env node
/**
 * What to Cook — ship an article to production
 *
 * Regenerates the site, runs the full SEO audit, shows you exactly what is
 * about to change, asks for confirmation, then commits and pushes. Vercel
 * auto-deploys from main, so the confirmation prompt is the last gate before
 * whattocook.life changes.
 *
 * Run: node _build/ship.js <slug>     ship, with a confirmation prompt
 *      node _build/ship.js <slug> -y  skip the prompt (use only in scripts)
 *
 * This deliberately does NOT draft or approve content. Drafting is a separate
 * step and human review sits between the two -- see CLAUDE.md on why this
 * pipeline must never auto-publish.
 */

const fs       = require('fs');
const path     = require('path');
const readline = require('readline');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const run  = (cmd, opts = {}) => execSync(cmd, { cwd: ROOT, encoding: 'utf8', ...opts });

const args = process.argv.slice(2);
const slug = args.find(a => !a.startsWith('-'));
const yes  = args.includes('-y') || args.includes('--yes');

// ── Refuse to ship from a detached/unknown branch ──────────────────────────
let branch;
try {
  branch = run('git rev-parse --abbrev-ref HEAD').trim();
} catch (_) {
  console.error('Not a git repository.');
  process.exit(1);
}
if (branch !== 'main') {
  console.error(`On branch "${branch}", not main. Vercel deploys from main -- switch first.`);
  process.exit(1);
}

// ── Rebuild so generated HTML always matches _data ─────────────────────────
console.log('Rebuilding site...');
run(`node "${path.join(__dirname, 'generate.js')}"`, { stdio: 'inherit' });

// ── Full audit across the whole corpus ─────────────────────────────────────
console.log('\nRunning SEO audit...');
try {
  run(`node "${path.join(__dirname, 'seo-audit.js')}"`, { stdio: 'inherit' });
} catch (_) {
  console.error('\nSEO audit found errors. Nothing was committed or pushed.');
  process.exit(1);
}

// ── Show what is about to go live ──────────────────────────────────────────
const status = run('git status --short').trim();
if (!status) {
  console.log('\nNothing to ship -- working tree is clean.');
  process.exit(0);
}

console.log('\nAbout to commit and push to main (Vercel will auto-deploy):\n');
console.log(run('git diff --stat HEAD').trimEnd() || status);
console.log('');

// ── Commit message ─────────────────────────────────────────────────────────
let title = slug;
if (slug) {
  const articles = JSON.parse(fs.readFileSync(path.join(ROOT, '_data/articles.json'), 'utf8'));
  const found = articles.find(a => a.slug === slug);
  if (found) title = found.title;
}
const message = slug
  ? `Add article: ${title}`
  : 'Update site content';

console.log(`Commit message: "${message}"\n`);

// ── Confirm ────────────────────────────────────────────────────────────────
function confirm() {
  if (yes) return Promise.resolve(true);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question('Push to production? [y/N] ', a => {
      rl.close();
      resolve(/^y(es)?$/i.test(a.trim()));
    });
  });
}

confirm().then(ok => {
  if (!ok) {
    console.log('Aborted. Nothing was committed or pushed.');
    process.exit(0);
  }
  run('git add -A', { stdio: 'inherit' });
  run(`git commit -m ${JSON.stringify(message)}`, { stdio: 'inherit' });
  run('git push', { stdio: 'inherit' });
  console.log('\nPushed. Vercel deploys in ~60s.');
  console.log('  https://whattocook.life');
  if (slug) console.log(`  https://whattocook.life/articles/${slug}/`);
});
