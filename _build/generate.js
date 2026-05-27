#!/usr/bin/env node
/**
 * What to Cook — Static site generator
 * Reads _data/recipes.json and _data/articles.json
 * Outputs one HTML file per entry into recipes/ and articles/
 * Run: node _build/generate.js
 */

const fs   = require('fs');
const path = require('path');

const ROOT    = path.join(__dirname, '..');
const RECIPES = JSON.parse(fs.readFileSync(path.join(ROOT, '_data/recipes.json'), 'utf8'));
const ARTICLES = JSON.parse(fs.readFileSync(path.join(ROOT, '_data/articles.json'), 'utf8'));

// ── Helpers ────────────────────────────────────────────────────────────────
const e = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const nl2p = s => s.split('\n\n').filter(Boolean).map(p => `<p>${e(p.trim())}</p>`).join('\n');

// ── Head template (shared) ─────────────────────────────────────────────────
function head(title, desc, keywords, canonical) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${e(title)}</title>
  <meta name="description" content="${e(desc)}" />
  <meta name="keywords" content="${e((keywords||[]).join(', '))}" />
  <meta property="og:title" content="${e(title)}" />
  <meta property="og:description" content="${e(desc)}" />
  <meta property="og:type" content="article" />
  <meta property="og:url" content="https://what-to-cook.in${canonical}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${e(title)}" />
  <meta name="twitter:description" content="${e(desc)}" />
  <link rel="canonical" href="https://what-to-cook.in${canonical}" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;1,400&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet" />
  <style>
    *,*::before,*::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --cream: #FAF7F2; --cream-dark: #F2EDE4; --green: #1A3A2A; --green-mid: #2D5C42;
      --amber: #C47B2B; --text: #1C1C1C; --text-mid: #4A4A4A; --text-light: #8A8A8A;
      --font-display: 'Cormorant Garamond', Georgia, serif;
      --font-body: 'DM Sans', -apple-system, sans-serif;
      --max: 720px;
    }
    body { background: var(--cream); color: var(--text); font-family: var(--font-body); font-size: 17px; line-height: 1.7; }
    a { color: var(--green-mid); text-decoration: none; }
    a:hover { text-decoration: underline; }

    /* Nav */
    .nav { background: var(--green); padding: 0 20px; height: 54px; display: flex; align-items: center; justify-content: space-between; }
    .nav-logo { font-family: var(--font-display); font-size: 22px; color: #FAF7F2; font-weight: 400; }
    .nav-links { display: flex; gap: 20px; }
    .nav-links a { color: rgba(255,255,255,0.7); font-size: 14px; font-weight: 500; }
    .nav-links a:hover { color: #fff; text-decoration: none; }

    /* Article layout */
    .article { max-width: var(--max); margin: 0 auto; padding: 40px 20px 80px; }
    .article-header { margin-bottom: 32px; }
    .article-label { font-size: 12px; font-weight: 500; color: var(--amber); text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 12px; }
    .article-title { font-family: var(--font-display); font-size: clamp(28px, 5vw, 42px); font-weight: 600; line-height: 1.15; color: var(--green); margin-bottom: 16px; }
    .article-subtitle { font-size: 18px; color: var(--text-mid); line-height: 1.5; margin-bottom: 20px; }
    .article-meta { font-size: 13px; color: var(--text-light); }
    .article-image { width: 100%; aspect-ratio: 16/9; object-fit: cover; border-radius: 12px; margin-bottom: 32px; }
    .article-intro { font-size: 18px; line-height: 1.7; color: var(--text-mid); border-left: 3px solid var(--amber); padding-left: 20px; margin-bottom: 36px; }

    /* Section */
    .section { margin-bottom: 36px; }
    .section h2 { font-family: var(--font-display); font-size: 24px; font-weight: 600; color: var(--green); margin-bottom: 14px; line-height: 1.3; }
    .section p { margin-bottom: 14px; }

    /* Macro table */
    .macro-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 12px; margin: 24px 0; }
    .macro-box { background: var(--cream-dark); border-radius: 10px; padding: 14px; text-align: center; }
    .macro-val { font-size: 24px; font-weight: 700; color: var(--green); display: block; }
    .macro-lbl { font-size: 11px; color: var(--text-light); text-transform: uppercase; letter-spacing: 0.06em; }

    /* Recipe specifics */
    .recipe-meta { display: flex; gap: 24px; flex-wrap: wrap; margin-bottom: 28px; }
    .recipe-meta-item { font-size: 13px; color: var(--text-mid); }
    .recipe-meta-item strong { color: var(--text); }
    .ingredients-group { margin-bottom: 18px; }
    .ingredients-group h3 { font-size: 14px; font-weight: 600; color: var(--green); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 8px; }
    .ingredients-group ul { list-style: disc; padding-left: 20px; }
    .ingredients-group li { margin-bottom: 4px; font-size: 15px; }
    .steps-list { counter-reset: steps; list-style: none; padding: 0; }
    .steps-list li { counter-increment: steps; padding: 14px 0 14px 48px; position: relative; border-bottom: 1px solid var(--cream-dark); font-size: 16px; }
    .steps-list li:last-child { border-bottom: none; }
    .steps-list li::before { content: counter(steps); position: absolute; left: 0; top: 14px; width: 32px; height: 32px; background: var(--green); color: #fff; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; }
    .tips-list { list-style: none; padding: 0; }
    .tips-list li { padding: 10px 0 10px 28px; position: relative; border-bottom: 1px solid var(--cream-dark); font-size: 15px; color: var(--text-mid); }
    .tips-list li:last-child { border-bottom: none; }
    .tips-list li::before { content: '→'; position: absolute; left: 0; color: var(--amber); font-weight: 700; }

    /* Takeaways */
    .takeaways { background: var(--green); border-radius: 16px; padding: 28px 24px; margin: 36px 0; }
    .takeaways h2 { color: #FAF7F2; font-family: var(--font-display); font-size: 22px; margin-bottom: 16px; }
    .takeaways ul { list-style: none; padding: 0; }
    .takeaways li { color: rgba(255,255,255,0.85); padding: 6px 0 6px 24px; position: relative; font-size: 15px; }
    .takeaways li::before { content: '✓'; position: absolute; left: 0; color: #7DC99A; }

    /* CTA */
    .cta-block { background: var(--cream-dark); border-radius: 16px; padding: 28px 24px; margin: 36px 0; text-align: center; }
    .cta-block p { font-size: 17px; color: var(--text-mid); margin-bottom: 16px; line-height: 1.5; }
    .cta-btn { display: inline-block; background: var(--green); color: #FAF7F2; padding: 14px 28px; border-radius: 50px; font-family: var(--font-body); font-size: 15px; font-weight: 500; transition: background 0.2s; }
    .cta-btn:hover { background: var(--green-mid); text-decoration: none; }

    /* Footer */
    .footer { background: var(--green); padding: 24px 20px; text-align: center; }
    .footer p { color: rgba(255,255,255,0.5); font-size: 13px; }
    .footer a { color: rgba(255,255,255,0.6); }
  </style>
</head>`;
}

function nav() {
  return `<nav class="nav">
  <a href="/" class="nav-logo">What to Cook</a>
  <div class="nav-links">
    <a href="/recipes/">Recipes</a>
    <a href="/articles/">Learn</a>
    <a href="https://foodi-ashen.vercel.app" target="_blank" rel="noopener">Try the app →</a>
  </div>
</nav>`;
}

function footer() {
  return `<footer class="footer">
  <p>© 2025 What to Cook &nbsp;·&nbsp; <a href="https://foodi-ashen.vercel.app">Build your personal meal plan</a></p>
</footer>`;
}

// ── Recipe page ────────────────────────────────────────────────────────────
function buildRecipePage(r) {
  const canonical = `/recipes/${r.slug}/`;

  const schema = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Recipe",
    "name": r.title,
    "description": r.meta_description,
    "image": r.image_url,
    "author": { "@type": "Organization", "name": "What to Cook" },
    "datePublished": new Date().toISOString().slice(0,10),
    "prepTime": `PT${r.prep_time.replace(/\D+/g,'') || 15}M`,
    "cookTime": `PT${r.cook_time.replace(/\D+/g,'') || 20}M`,
    "recipeYield": String(r.servings),
    "recipeCuisine": r.cuisine,
    "recipeCategory": r.tags[0] || "Meal",
    "keywords": (r.schema_keywords || []).join(', '),
    "nutrition": {
      "@type": "NutritionInformation",
      "calories": String(r.nutrition_per_serving.calories) + " calories",
      "proteinContent": String(r.nutrition_per_serving.protein_g) + " g",
      "carbohydrateContent": String(r.nutrition_per_serving.carbs_g) + " g",
      "fatContent": String(r.nutrition_per_serving.fat_g) + " g"
    },
    "recipeIngredient": r.ingredients.flatMap(g => g.items),
    "recipeInstructions": r.steps.map((s,i) => ({
      "@type": "HowToStep",
      "position": i+1,
      "text": s
    }))
  });

  const ingredientsHTML = r.ingredients.map(g => `
    <div class="ingredients-group">
      <h3>${e(g.group)}</h3>
      <ul>${g.items.map(i => `<li>${e(i)}</li>`).join('')}</ul>
    </div>`).join('');

  const stepsHTML = `<ol class="steps-list">${r.steps.map(s => `<li>${e(s)}</li>`).join('')}</ol>`;

  const tipsHTML = r.pro_tips && r.pro_tips.length
    ? `<div class="section"><h2>Pro tips</h2><ul class="tips-list">${r.pro_tips.map(t=>`<li>${e(t)}</li>`).join('')}</ul></div>`
    : '';

  const variationsHTML = r.variations && r.variations.length
    ? `<div class="section"><h2>Variations</h2>${r.variations.map(v=>`<div style="margin-bottom:14px;"><strong>${e(v.name)}:</strong> ${e(v.description)}</div>`).join('')}</div>`
    : '';

  return `${head(r.title + ' — What to Cook', r.meta_description, r.schema_keywords, canonical)}
<body>
<script type="application/ld+json">${schema}</script>
${nav()}
<main class="article">
  <div class="article-header">
    <p class="article-label">${e(r.cuisine)} · Recipe</p>
    <h1 class="article-title">${e(r.title)}</h1>
    <p class="article-subtitle">${e(r.subtitle)}</p>
    <p class="article-meta">Prep: ${e(r.prep_time)} &nbsp;·&nbsp; Cook: ${e(r.cook_time)} &nbsp;·&nbsp; Serves: ${r.servings}</p>
  </div>
  <img src="${e(r.image_url)}" alt="${e(r.image_alt)}" class="article-image" loading="lazy" />
  <p class="article-intro">${e(r.intro)}</p>

  <div class="macro-grid">
    <div class="macro-box"><span class="macro-val">${r.nutrition_per_serving.calories}</span><span class="macro-lbl">Calories</span></div>
    <div class="macro-box"><span class="macro-val">${r.nutrition_per_serving.protein_g}g</span><span class="macro-lbl">Protein</span></div>
    <div class="macro-box"><span class="macro-val">${r.nutrition_per_serving.carbs_g}g</span><span class="macro-lbl">Carbs</span></div>
    <div class="macro-box"><span class="macro-val">${r.nutrition_per_serving.fat_g}g</span><span class="macro-lbl">Fat</span></div>
    ${r.nutrition_per_serving.fibre_g ? `<div class="macro-box"><span class="macro-val">${r.nutrition_per_serving.fibre_g}g</span><span class="macro-lbl">Fibre</span></div>` : ''}
  </div>

  <div class="section">
    <h2>Ingredients</h2>
    ${ingredientsHTML}
  </div>

  <div class="section">
    <h2>Method</h2>
    ${stepsHTML}
  </div>

  ${tipsHTML}
  ${variationsHTML}

  <div class="cta-block">
    <p>${e(r.cta_text)}</p>
    <a href="https://foodi-ashen.vercel.app" class="cta-btn" target="_blank" rel="noopener">Build my meal plan — free &rarr;</a>
  </div>
</main>
${footer()}
</body>
</html>`;
}

// ── Article page ────────────────────────────────────────────────────────────
function buildArticlePage(a) {
  const canonical = `/articles/${a.slug}/`;

  const schema = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": a.title,
    "description": a.meta_description,
    "author": { "@type": "Organization", "name": "What to Cook" },
    "publisher": { "@type": "Organization", "name": "What to Cook", "url": "https://what-to-cook.in" },
    "datePublished": a.published_date,
    "mainEntityOfPage": { "@type": "WebPage", "@id": `https://what-to-cook.in${canonical}` },
    "keywords": a.meta_keywords
  });

  const sectionsHTML = a.sections.map(s => `
    <div class="section">
      <h2>${e(s.heading)}</h2>
      ${nl2p(s.body)}
    </div>`).join('');

  const takeawaysHTML = a.key_takeaways && a.key_takeaways.length ? `
    <div class="takeaways">
      <h2>Key takeaways</h2>
      <ul>${a.key_takeaways.map(t=>`<li>${e(t)}</li>`).join('')}</ul>
    </div>` : '';

  return `${head(a.title + ' — What to Cook', a.meta_description, (a.meta_keywords||'').split(',').map(s=>s.trim()), canonical)}
<body>
<script type="application/ld+json">${schema}</script>
${nav()}
<main class="article">
  <div class="article-header">
    <p class="article-label">${e(a.category)} · ${e(a.read_time)}</p>
    <h1 class="article-title">${e(a.title)}</h1>
  </div>
  <p class="article-intro">${e(a.intro)}</p>
  ${sectionsHTML}
  ${takeawaysHTML}
  <div class="cta-block">
    <p>${e(a.cta_text)}</p>
    <a href="https://foodi-ashen.vercel.app" class="cta-btn" target="_blank" rel="noopener">Build my meal plan — free &rarr;</a>
  </div>
</main>
${footer()}
</body>
</html>`;
}

// ── Index pages ────────────────────────────────────────────────────────────
function buildRecipeIndex() {
  const cards = RECIPES.map(r => `
    <a href="/recipes/${r.slug}/" class="card">
      <img src="${e(r.image_url)}" alt="${e(r.image_alt)}" loading="lazy" />
      <div class="card-body">
        <p class="card-label">${e(r.cuisine)}</p>
        <h2 class="card-title">${e(r.title)}</h2>
        <p class="card-sub">${r.nutrition_per_serving.protein_g}g protein · ${r.nutrition_per_serving.calories} kcal</p>
      </div>
    </a>`).join('');
  return indexPage('Recipes', '/recipes/', 'High-protein Indian recipes with full macros', 'Recipes', cards);
}

function buildArticleIndex() {
  const cards = ARTICLES.map(a => `
    <a href="/articles/${a.slug}/" class="card">
      <div class="card-body" style="padding:24px;">
        <p class="card-label">${e(a.category)} · ${e(a.read_time)}</p>
        <h2 class="card-title">${e(a.title)}</h2>
      </div>
    </a>`).join('');
  return indexPage('Learn', '/articles/', 'Evidence-based Indian nutrition guides', 'Articles', cards);
}

function indexPage(name, canonical, desc, label, cards) {
  return `${head(`${name} — What to Cook`, desc, [], canonical)}
<body>
${nav()}
<main style="max-width:1100px;margin:0 auto;padding:40px 20px 80px;">
  <h1 style="font-family:var(--font-display);font-size:36px;color:var(--green);margin-bottom:8px;">${name}</h1>
  <p style="color:var(--text-light);margin-bottom:32px;">${desc}</p>
  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:24px;">
    ${cards}
  </div>
</main>
${footer()}
<style>
  .card { display:block; background:#fff; border-radius:14px; overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,0.07); transition:transform 0.2s,box-shadow 0.2s; text-decoration:none; color:inherit; }
  .card:hover { transform:translateY(-2px); box-shadow:0 6px 18px rgba(0,0,0,0.1); }
  .card img { width:100%; aspect-ratio:16/9; object-fit:cover; }
  .card-body { padding:16px; }
  .card-label { font-size:11px;font-weight:500;color:var(--amber);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px; }
  .card-title { font-family:var(--font-display);font-size:19px;color:var(--green);line-height:1.25;margin-bottom:6px; }
  .card-sub { font-size:13px;color:var(--text-light); }
</style>
</body>
</html>`;
}

// ── Homepage ───────────────────────────────────────────────────────────────
function buildHomepage() {
  const recentRecipes = RECIPES.slice(0,3).map(r => `
    <a href="/recipes/${r.slug}/" class="card">
      <img src="${e(r.image_url)}" alt="${e(r.image_alt)}" loading="lazy" />
      <div class="card-body">
        <p class="card-label">${e(r.cuisine)}</p>
        <h2 class="card-title">${e(r.title)}</h2>
        <p class="card-sub">${r.nutrition_per_serving.protein_g}g protein · ${r.nutrition_per_serving.calories} kcal</p>
      </div>
    </a>`).join('');

  return `${head('What to Cook — Indian Recipes & Nutrition for Real Food Goals', 'High-protein Indian recipes, nutrition guides, and a free AI meal planner built for Indian kitchens.', ['Indian recipes protein', 'Indian meal plan weight loss', 'high protein Indian food'], '/')}
<body>
${nav()}
<section style="background:var(--green);padding:60px 20px;text-align:center;">
  <h1 style="font-family:var(--font-display);font-size:clamp(32px,6vw,56px);color:#FAF7F2;line-height:1.15;margin-bottom:16px;">Food you love,<br>that loves <em>you</em> back.</h1>
  <p style="color:rgba(255,255,255,0.7);font-size:18px;max-width:540px;margin:0 auto 28px;">Real Indian recipes. Honest nutrition. And a meal planner that learns your taste and builds your week.</p>
  <a href="https://foodi-ashen.vercel.app" style="display:inline-block;background:var(--amber);color:#fff;padding:14px 32px;border-radius:50px;font-size:16px;font-weight:500;text-decoration:none;" target="_blank" rel="noopener">Build my meal plan — free &rarr;</a>
</section>

<main style="max-width:1100px;margin:0 auto;padding:48px 20px 80px;">
  <h2 style="font-family:var(--font-display);font-size:28px;color:var(--green);margin-bottom:24px;">Latest recipes</h2>
  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:24px;margin-bottom:40px;">
    ${recentRecipes}
  </div>
  <a href="/recipes/" style="color:var(--green-mid);font-weight:500;">See all recipes →</a>

  <hr style="margin:48px 0;border:none;border-top:1px solid var(--cream-dark);" />

  <h2 style="font-family:var(--font-display);font-size:28px;color:var(--green);margin-bottom:8px;">The meal planner</h2>
  <p style="color:var(--text-mid);max-width:600px;margin-bottom:24px;line-height:1.7;">Answer 10 questions about what you love to eat. Get a full week of personalised Indian meals — with macros, grocery list, and YouTube recipe links. Free, no app download.</p>
  <a href="https://foodi-ashen.vercel.app" style="display:inline-block;background:var(--green);color:#FAF7F2;padding:12px 24px;border-radius:50px;font-size:15px;font-weight:500;text-decoration:none;" target="_blank" rel="noopener">Try What to Cook →</a>
</main>
${footer()}
<style>
  .card { display:block; background:#fff; border-radius:14px; overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,0.07); transition:transform 0.2s,box-shadow 0.2s; text-decoration:none; color:inherit; }
  .card:hover { transform:translateY(-2px); box-shadow:0 6px 18px rgba(0,0,0,0.1); }
  .card img { width:100%; aspect-ratio:16/9; object-fit:cover; }
  .card-body { padding:16px; }
  .card-label { font-size:11px;font-weight:500;color:var(--amber);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px; }
  .card-title { font-family:var(--font-display);font-size:19px;color:var(--green);line-height:1.25;margin-bottom:6px; }
  .card-sub { font-size:13px;color:var(--text-light); }
</style>
</body>
</html>`;
}

// ── Write files ────────────────────────────────────────────────────────────
let count = 0;

function writeFile(filepath, content) {
  const dir = path.dirname(filepath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filepath, content, 'utf8');
  count++;
  console.log('✓', filepath.replace(ROOT + '/', ''));
}

// Homepage
writeFile(path.join(ROOT, 'index.html'), buildHomepage());

// Recipe index + pages
writeFile(path.join(ROOT, 'recipes/index.html'), buildRecipeIndex());
RECIPES.forEach(r => writeFile(path.join(ROOT, `recipes/${r.slug}/index.html`), buildRecipePage(r)));

// Article index + pages
writeFile(path.join(ROOT, 'articles/index.html'), buildArticleIndex());
ARTICLES.forEach(a => writeFile(path.join(ROOT, `articles/${a.slug}/index.html`), buildArticlePage(a)));

// Vercel config (clean URLs)
writeFile(path.join(ROOT, 'vercel.json'), JSON.stringify({
  "cleanUrls": true,
  "trailingSlash": false
}, null, 2));

console.log(`\nDone — ${count} files written.`);
