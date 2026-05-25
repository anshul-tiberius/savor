# Savor — Claude Code Context

## What is Savor
India-first AI meal planning app. Joy-first positioning — the central belief is that healthy eating and delicious eating are not in conflict. Tagline: **"Food you love that loves you back."**

Target user: Indian households, 30–49 age group, self-cookers or homes with a cook/chef.

**Live URL:** `https://foodi-ashen.vercel.app`

---

## Repo Structure

```
/                          ← project root (working directory)
├── index.html             ← old version (sage/terracotta design, not in active use)
├── savor-main/            ← ACTIVE codebase — all work goes here
│   ├── index.html         ← the entire app (5 screens, all JS, all CSS) — Cormorant/DM Sans, green/amber/cream
│   ├── app.html           ← older sage/terracotta version, accessible at /app route — do not edit
│   ├── landing-v1.html    ← old landing page, preserved — do not touch
│   ├── hero-1.jpg         ← hero image assets
│   ├── hero-2.jpg
│   ├── api/
│   │   └── chat.js        ← Vercel serverless function — proxies all Claude API calls
│   ├── vercel.json        ← routing config + maxDuration:60 for api/chat.js
│   └── CLAUDE (1).md      ← legacy CLAUDE doc (space in name, not auto-loaded — use this file instead)
└── CLAUDE.md              ← THIS FILE (active context)
```

---

## Architecture

**Single-file frontend** — `savor-main/index.html` contains all 5 screens, all CSS, and all JS. No React, no build step, no npm. Deploys by pushing to GitHub.

**Backend** — one Vercel serverless function at `savor-main/api/chat.js`. Proxies all Claude API calls so the API key never touches the browser. Currently uses `claude-sonnet-4-5` — can be upgraded to `claude-sonnet-4-6`.

**Database** — Google Sheets via Apps Script webhook. User email + profile JSON is posted at end of onboarding.

**Hosting** — Vercel, connected to GitHub. Auto-deploys on every push to main.

---

## Environment Variables (set in Vercel dashboard)

```
ANTHROPIC_API_KEY = sk-ant-...   ← never put this in code
```

Google Sheet webhook URL is hardcoded in `savor-main/index.html` in the `GOOGLE_SHEET_WEBHOOK` constant — this is fine, it's not a secret.

---

## The 5 Screens

All screens live inside `savor-main/index.html`. Navigation is handled by `showScreen(name)` which toggles `display` on `.screen` divs.

### Screen 1 — Landing (`#screen-landing`)
- Headline: "Food you love, that loves you back."
- 3 Unsplash food images (grid: 1 tall left + 2 stacked right, 260px height)
- Email input + "Start now" CTA
- Email stored in `appState.email`, not sent anywhere until onboarding completes

### Screen 2 — Onboarding Chat (`#screen-onboarding`)
- iMessage-style chat UI — Savor on left (green avatar), user on right (dark green bubble)
- Voice input via `SpeechRecognition` API (lang: `en-IN`) — Chrome only; shows alert in others
- Full conversation history sent each time (stateless API calls)
- Profile detection: looks for `<profile>{...}</profile>` in Claude's response
- On profile detected: strip JSON from display, save to Google Sheet, transition to Screen 3 after 800ms
- Fallback: catches raw JSON block output in case model ignores tag instruction
- Status line: "Getting to know you..." → (4+ user msgs) "Getting to know you better..." → (8+ user msgs) "Almost there..."

### Screen 3 — Holding Screen (`#screen-holding`)
- Dark forest green background (`#1A3A2A`)
- 16 cycling loading lines (Indian-flavoured humour, 2.8s each)
- Chef GIF in circular container (currently a Tenor GIF — may 404; emoji fallback `👨‍🍳` on error)
- Meal plan generation fires on mount via `generateMealPlan()`
- On plan ready: transitions to Screen 4

### Screen 4 — Weekly Meal Plan (`#screen-plan`)
- Mon–Sun day tabs (scrollable)
- Each day: total kcal + protein bar, then meal cards (breakfast/lunch/snack/dinner)
- Each meal card: type badge, dish name, 2-line description, macro chips (kcal/protein/carbs/fat), allergen chips
- "Talk to Savor" button → feedback modal (bottom sheet)
- Feedback modal: user types changes → "Regenerate Plan" → back to Screen 3 → new plan

### Screen 5 — Dish Detail (`#screen-dish`)
- Dish type, full name, description, macro grid (4 boxes)
- Tags
- "Find Recipe on YouTube" → `https://www.youtube.com/results?search_query={recipe_search}`
- Back arrow → Screen 4

---

## App State

```javascript
appState = {
  screen: 'landing',
  email: '',
  chatMessages: [],      // [{role, content}] — full history sent to API each turn
  userProfile: null,     // parsed JSON profile from onboarding
  mealPlan: null,        // parsed JSON meal plan
  activeDay: 0,          // 0 = Monday
  currentDish: null,
  isTyping: false,
  recognition: null,     // SpeechRecognition instance
  isRecording: false,
  demoName: '',          // used in demo mode only
}
```

---

## API Call Flow

**Onboarding:**
```
user types/speaks → sendMessage() → POST /api/chat → Claude API → response displayed
→ if <profile> detected → saveToSheet() → showScreen('holding') → generateMealPlan()
```

**Meal plan generation:**
```
generateMealPlan(feedback?) → POST /api/chat with MEAL_PLAN_SYSTEM + profile JSON
→ parse JSON response → renderPlan() → showScreen('plan')
```

**Feedback/regenerate:**
```
user types feedback → regeneratePlan() → showScreen('holding') → generateMealPlan(feedback)
→ new plan replaces old in appState.mealPlan → renderPlan()
```

---

## System Prompts (in savor-main/index.html)

### ONBOARDING_SYSTEM
- ONE question per message
- 10-12 questions: name, age, city, grew up where, cultural background, household + cook, cuisine loves, hard nos, meat preference, health goal + weight, medical restrictions, meal timing
- Messages SHORT — 2-4 sentences max
- Final message: warm 2-sentence wrap-up + `<profile>{...}</profile>` JSON
- Never output JSON mid-conversation

### MEAL_PLAN_SYSTEM
Outputs pure JSON (no markdown). 7-day structure with `week_vibe`, `days[]` each with `day`, `vibe`, `meals[]`, `totals`.

Each meal has: `type`, `time`, `name`, `description`, `kcal`, `protein_g`, `carbs_g`, `fat_g`, `tags`, `allergens`, `recipe_search`, `prep_note`.

**Critical:** Only real dishes with findable recipes. Never invent fictional dishes.

---

## Design System (savor-main/index.html)

```css
--cream:       #FAF7F2   /* main background */
--cream-dark:  #F2EDE4   /* subtle dividers */
--green:       #1A3A2A   /* primary brand colour */
--green-mid:   #2D5C42   /* hover states */
--green-light: #E8F0EB   /* light green tints */
--amber:       #C47B2B   /* accent/CTA */
--amber-light: #FAEEDA
--text:        #1C1C1C
--text-mid:    #4A4A4A
--text-light:  #8A8A8A

--font-display: 'Cormorant Garamond'  /* headings, editorial feel */
--font-body:    'DM Sans'             /* UI, readable */
--radius:       16px
--radius-sm:    10px
```

Mobile-first. Desktop: max-width 420px centred, box-shadow, `#E8E3DB` outer background.

---

## Known Issues / Next Up

- [x] Chef GIF may 404 — replaced with CSS bounce animation + 👨‍🍳 emoji (no external dep)
- [ ] Dish detail shows a generic emoji placeholder — ideally dish-specific photo
- [ ] No user accounts / login — users can't return to their plan (v2 feature)
- [ ] Google Sheet webhook fires but needs end-to-end testing with real data
- [x] Voice input (`SpeechRecognition`) only works in Chrome — replaced `alert()` with inline toast
- [x] Vercel serverless timeout — fixed: `maxDuration: 60` already set in `vercel.json`
- [ ] "Talk to Savor" feedback is a plain textarea — could be a real chat interface
- [x] Add a favicon — SVG inline data URI (dark green background, Savor "S")
- [x] Add OG meta tags for WhatsApp/Twitter sharing previews
- [ ] Real food photography — replace Unsplash placeholders with Savor-branded shots
- [x] `api/chat.js` upgraded to `claude-sonnet-4-6`

---

## Vercel Config (`savor-main/vercel.json`)

```json
{
  "functions": {
    "api/chat.js": { "maxDuration": 60 }
  },
  "rewrites": [
    { "source": "/app", "destination": "/app.html" },
    { "source": "/",    "destination": "/index.html" }
  ]
}
```

---

## Things to Never Do

- Never put `ANTHROPIC_API_KEY` in `index.html` or any frontend file
- Never call `api.anthropic.com` directly from the browser (CORS + key exposure)
- Never invent dish names — only real dishes with findable recipes
- Never use curly/smart apostrophes in JS strings — use straight apostrophes or escape them
- Never add `type: "module"` to `api/chat.js` — Vercel handles ESM→CJS compilation
- Never touch `landing-v1.html` or `app.html` — preserved old versions

---

## How to Deploy

1. Edit files in `savor-main/`
2. `git add . && git commit -m "your message" && git push`
3. Vercel auto-deploys in ~60 seconds
4. Check `https://foodi-ashen.vercel.app`

To add/change environment variables:
- Vercel dashboard → Project → Settings → Environment Variables
- After changing env vars, trigger a manual redeploy (Deployments → three dots → Redeploy)

---

## Product Context

**Positioning:** Joy-first, not discipline-first. Healthy and delicious are not in conflict.

**What makes Savor different:**
- Conversational onboarding (not a form)
- India-first — Marwari, Gujarati, South Indian, Bengali cuisines all understood
- Links to real YouTube creators for recipes
- Invisible nutrition tracking — macros auto-calculated
- No guilt-based scoring

**Tone of voice:** Warm, curious, like a smart friend. Never clinical. Never diet-culture coded. Use Indian food references naturally (dal, sabziwala, masala dabba, nani's kitchen).

**Do not build yet:** Pantry management, persistent accounts, push notifications, payment. Focus: nail the core joy loop — onboard → generate → delight.
