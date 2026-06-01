#!/usr/bin/env node
/**
 * What to Cook — Static site generator
 * Reads _data/recipes.json and _data/articles.json
 * Outputs one HTML file per entry into recipes/ and articles/
 * Run: node _build/generate.js  (from savor-main/ or any directory)
 *
 * IMPORTANT: Writes to home.html, NOT index.html.
 * index.html is the meal-planning app — never overwrite it from here.
 */

const fs   = require('fs');
const path = require('path');

const ROOT    = path.join(__dirname, '..');
const RECIPES = JSON.parse(fs.readFileSync(path.join(ROOT, '_data/recipes.json'), 'utf8'));
const ARTICLES = JSON.parse(fs.readFileSync(path.join(ROOT, '_data/articles.json'), 'utf8'));

const DOMAIN  = 'https://whattocook.life';
const APP_URL = 'https://app.whattocook.life';

// ── Helpers ────────────────────────────────────────────────────────────────
const e = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const nl2p = s => s.split('\n\n').filter(Boolean).map(p => `<p>${e(p.trim())}</p>`).join('\n');

// ── Head template (shared) ─────────────────────────────────────────────────
function head(title, desc, keywords, canonical, image) {
  const imgUrl = image ? `${image}?w=1200&auto=format&fit=crop&q=80` : '';
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
  <meta property="og:url" content="${DOMAIN}${canonical}" />${imgUrl ? `
  <meta property="og:image" content="${imgUrl}" />
  <meta name="twitter:image" content="${imgUrl}" />` : ''}
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${e(title)}" />
  <meta name="twitter:description" content="${e(desc)}" />
  <link rel="canonical" href="${DOMAIN}${canonical}" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;1,400&family=DM+Sans:wght@300;400;500&display=swap" rel="stylesheet" />
  <style>
    *,*::before,*::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --cream: #FAF7F2; --cream-dark: #F2EDE4; --green: #1A3A2A; --green-mid: #2D5C42;
      --amber: #C47B2B; --amber-light: #FAEEDA; --text: #1C1C1C; --text-mid: #4A4A4A; --text-light: #8A8A8A;
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

    /* Quick answer */
    .quick-answer { background: var(--amber-light); border-left: 4px solid var(--amber); padding: 20px 24px; border-radius: 0 12px 12px 0; margin-bottom: 32px; }
    .quick-answer-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.12em; color: var(--amber); margin-bottom: 10px; }
    .quick-answer p { font-size: 16px; line-height: 1.65; color: var(--text); margin-bottom: 0; }

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

    /* FAQ */
    .faq-section h3 { font-family: var(--font-body); font-size: 17px; font-weight: 500; color: var(--text); margin-bottom: 8px; line-height: 1.4; }
    .faq-item { margin-bottom: 24px; padding-bottom: 24px; border-bottom: 1px solid var(--cream-dark); }
    .faq-item:last-child { border-bottom: none; padding-bottom: 0; }
    .faq-item p { color: var(--text-mid); font-size: 15px; line-height: 1.65; }

    /* Author bio */
    .author-bio { border-top: 1px solid var(--cream-dark); padding: 24px 0; margin-top: 32px; display: flex; gap: 16px; align-items: flex-start; }
    .author-avatar { width: 44px; height: 44px; background: var(--green); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #FAF7F2; font-family: var(--font-display); font-size: 18px; font-weight: 600; flex-shrink: 0; }
    .author-info strong { display: block; color: var(--text); font-size: 15px; margin-bottom: 2px; }
    .author-info span { color: var(--text-light); font-size: 13px; line-height: 1.5; }

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
    <a href="${APP_URL}" target="_blank" rel="noopener">Try the app &#8594;</a>
  </div>
</nav>`;
}

function footer() {
  return `<footer class="footer">
  <p>&copy; 2025 What to Cook &nbsp;&middot;&nbsp; <a href="${APP_URL}">Build your personal meal plan</a></p>
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
    "author": { "@type": "Person", "name": "Anshul Tibrewala" },
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
    <p class="article-label">${e(r.cuisine)} &middot; Recipe</p>
    <h1 class="article-title">${e(r.title)}</h1>
    <p class="article-subtitle">${e(r.subtitle)}</p>
    <p class="article-meta">Prep: ${e(r.prep_time)} &nbsp;&middot;&nbsp; Cook: ${e(r.cook_time)} &nbsp;&middot;&nbsp; Serves: ${r.servings}</p>
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
    <a href="${APP_URL}" class="cta-btn" target="_blank" rel="noopener">Build my meal plan &#8212; free &#8594;</a>
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
    "image": a.hero_image_url || '',
    "author": { "@type": "Person", "name": "Anshul Tibrewala" },
    "publisher": { "@type": "Organization", "name": "What to Cook", "url": DOMAIN },
    "datePublished": a.published_date,
    "mainEntityOfPage": { "@type": "WebPage", "@id": `${DOMAIN}${canonical}` },
    "keywords": a.meta_keywords
  });

  const faqSchema = a.faq && a.faq.length ? JSON.stringify({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": a.faq.map(q => ({
      "@type": "Question",
      "name": q.question,
      "acceptedAnswer": { "@type": "Answer", "text": q.answer }
    }))
  }) : null;

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

  const quickAnswerHTML = a.quick_answer ? `
    <div class="quick-answer">
      <p class="quick-answer-label">Quick answer</p>
      ${nl2p(a.quick_answer)}
    </div>` : '';

  const heroImageHTML = a.hero_image_url ? `
    <img src="${e(a.hero_image_url)}" alt="${e(a.title)}" class="article-image" loading="lazy" />` : '';

  const faqHTML = a.faq && a.faq.length ? `
    <div class="section faq-section">
      <h2>Frequently asked questions</h2>
      ${a.faq.map(q => `
      <div class="faq-item">
        <h3>${e(q.question)}</h3>
        <p>${e(q.answer)}</p>
      </div>`).join('')}
    </div>` : '';

  return `${head(a.title + ' — What to Cook', a.meta_description, (a.meta_keywords||'').split(',').map(s=>s.trim()), canonical)}
<body>
<script type="application/ld+json">${schema}</script>
${faqSchema ? `<script type="application/ld+json">${faqSchema}</script>` : ''}
${nav()}
<main class="article">
  <div class="article-header">
    <p class="article-label">${e(a.category)} &middot; ${e(a.read_time)}</p>
    <h1 class="article-title">${e(a.title)}</h1>
  </div>
  ${heroImageHTML}
  ${quickAnswerHTML}
  <p class="article-intro">${e(a.intro)}</p>
  ${sectionsHTML}
  ${takeawaysHTML}
  ${faqHTML}
  <div class="author-bio">
    <div class="author-avatar">A</div>
    <div class="author-info">
      <strong>Anshul Tibrewala</strong>
      <span>Founder of What to Cook. Building India-first AI nutrition tools. Based in Bangalore.</span>
    </div>
  </div>
  <div class="cta-block">
    <p>${e(a.cta_text)}</p>
    <a href="${APP_URL}" class="cta-btn" target="_blank" rel="noopener">Build my meal plan &#8212; free &#8594;</a>
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
        <p class="card-sub">${r.nutrition_per_serving.protein_g}g protein &middot; ${r.nutrition_per_serving.calories} kcal</p>
      </div>
    </a>`).join('');
  return indexPage('Recipes', '/recipes/', 'High-protein Indian recipes with full macros', cards, false);
}

function buildArticleIndex() {
  const cards = ARTICLES.map(a => `
    <a href="/articles/${a.slug}/" class="card">
      ${a.hero_image_url ? `<img src="${e(a.hero_image_url)}" alt="${e(a.title)}" loading="lazy" />` : ''}
      <div class="card-body card-body-text">
        <p class="card-label">${e(a.category)} &middot; ${e(a.read_time)}</p>
        <h2 class="card-title">${e(a.title)}</h2>
      </div>
    </a>`).join('');
  return indexPage('Learn', '/articles/', 'Evidence-based Indian nutrition guides', cards, true);
}

function indexPage(name, canonical, desc, cards, isArticles) {
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
  .card-body-text { padding:20px 20px 24px; }
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
        <p class="card-sub">${r.nutrition_per_serving.protein_g}g protein &middot; ${r.nutrition_per_serving.calories} kcal</p>
      </div>
    </a>`).join('');

  const recentArticles = ARTICLES.slice(0,3).map(a => `
    <a href="/articles/${a.slug}/" class="card">
      ${a.hero_image_url ? `<img src="${e(a.hero_image_url)}" alt="${e(a.title)}" loading="lazy" />` : ''}
      <div class="card-body card-body-text">
        <p class="card-label">${e(a.category)}</p>
        <h2 class="card-title">${e(a.title)}</h2>
      </div>
    </a>`).join('');

  return `${head('What to Cook — Indian Recipes & Nutrition for Real Food Goals', 'High-protein Indian recipes with real macros, evidence-based nutrition guides, and a free AI meal planner built for Indian kitchens.', ['Indian recipes protein', 'Indian meal plan weight loss', 'high protein Indian food'], '/')}
<body>
${nav()}

<section style="background:var(--green);padding:64px 20px;text-align:center;">
  <h1 style="font-family:var(--font-display);font-size:clamp(34px,6vw,58px);color:#FAF7F2;line-height:1.12;margin-bottom:16px;">Your place to find great recipes<br>and eat well without giving up<br><em>the food you love.</em></h1>
  <p style="color:rgba(255,255,255,0.72);font-size:18px;max-width:560px;margin:0 auto 28px;line-height:1.6;">Practical Indian recipes with real macros. Evidence-based guides on eating well. And an AI meal planner that builds your week around what you actually enjoy.</p>
  <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">
    <a href="/recipes/" style="display:inline-block;background:var(--amber);color:#fff;padding:13px 28px;border-radius:50px;font-size:15px;font-weight:500;text-decoration:none;">Browse Recipes &#8594;</a>
    <a href="/articles/" style="display:inline-block;background:transparent;color:#FAF7F2;border:1px solid rgba(255,255,255,0.35);padding:13px 28px;border-radius:50px;font-size:15px;font-weight:500;text-decoration:none;">Read Articles &#8594;</a>
  </div>
</section>

<main style="max-width:1100px;margin:0 auto;padding:56px 20px 80px;">

  <section style="margin-bottom:60px;">
    <p style="font-size:11px;font-weight:600;color:var(--amber);text-transform:uppercase;letter-spacing:0.12em;margin-bottom:8px;">RECIPES</p>
    <h2 style="font-family:var(--font-display);font-size:30px;color:var(--green);margin-bottom:24px;">High-protein Indian recipes, with full macros</h2>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:24px;margin-bottom:20px;">${recentRecipes}</div>
    <a href="/recipes/" style="color:var(--green-mid);font-weight:500;font-size:15px;">See all recipes &#8594;</a>
  </section>

  <hr style="border:none;border-top:1px solid var(--cream-dark);margin-bottom:60px;" />

  <section style="margin-bottom:60px;">
    <p style="font-size:11px;font-weight:600;color:var(--amber);text-transform:uppercase;letter-spacing:0.12em;margin-bottom:8px;">LEARN</p>
    <h2 style="font-family:var(--font-display);font-size:30px;color:var(--green);margin-bottom:24px;">Evidence-based guides for Indian eaters</h2>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:24px;margin-bottom:20px;">${recentArticles}</div>
    <a href="/articles/" style="color:var(--green-mid);font-weight:500;font-size:15px;">See all articles &#8594;</a>
  </section>

  <hr style="border:none;border-top:1px solid var(--cream-dark);margin-bottom:60px;" />

  <section style="background:var(--green);border-radius:20px;padding:44px 36px;text-align:center;">
    <h2 style="font-family:var(--font-display);font-size:36px;color:#FAF7F2;margin-bottom:14px;line-height:1.2;">Want a meal plan built for your kitchen?</h2>
    <p style="color:rgba(255,255,255,0.72);max-width:520px;margin:0 auto 24px;font-size:17px;line-height:1.65;">Tell us about your tastes, your household, and your goals. You get a personalised week of Indian meals &#8212; breakfast to dinner, full macros, grocery list. Takes two minutes. Free.</p>
    <a href="${APP_URL}" style="display:inline-block;background:var(--amber);color:#fff;padding:14px 32px;border-radius:50px;font-size:16px;font-weight:500;text-decoration:none;" target="_blank" rel="noopener">Build my meal plan &#8212; free &#8594;</a>
  </section>

</main>
${footer()}
<style>
  .card { display:block; background:#fff; border-radius:14px; overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,0.07); transition:transform 0.2s,box-shadow 0.2s; text-decoration:none; color:inherit; }
  .card:hover { transform:translateY(-2px); box-shadow:0 6px 18px rgba(0,0,0,0.1); }
  .card img { width:100%; aspect-ratio:16/9; object-fit:cover; }
  .card-body { padding:16px; }
  .card-body-text { padding:20px 20px 24px; }
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

// Homepage — writes to home.html, NOT index.html (index.html is the app)
writeFile(path.join(ROOT, 'home.html'), buildHomepage());

// Recipe index + individual pages
writeFile(path.join(ROOT, 'recipes/index.html'), buildRecipeIndex());
RECIPES.forEach(r => writeFile(path.join(ROOT, `recipes/${r.slug}/index.html`), buildRecipePage(r)));

// Article index + individual pages
writeFile(path.join(ROOT, 'articles/index.html'), buildArticleIndex());
ARTICLES.forEach(a => writeFile(path.join(ROOT, `articles/${a.slug}/index.html`), buildArticlePage(a)));

console.log(`\nDone — ${count} files written.`);
console.log('Note: vercel.json is NOT touched by this script. Manage it separately.');
