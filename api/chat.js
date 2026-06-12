// ── In-memory rate limiting ──────────────────────────────────────────────────
// Two tiers to protect API budget without frustrating real users:
//   cheap     — onboarding + Ask Chef chat: 30/IP/hour
//   expensive — meal plan generation:       3/IP/6 hours
//
// Stored in a Map that lives for the lifetime of the serverless instance.
// Not perfect (resets on cold start) but deters automated abuse with zero
// external infrastructure.

const rateStore = new Map();
const RATE_LIMITS = {
  cheap:     { window: 60 * 60 * 1000,     max: 30 },
  expensive: { window: 6 * 60 * 60 * 1000, max: 3  },
};

const MODE_CONFIG = {
  onboarding: {
    tier: 'cheap',
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1500,
    system: `You are What to Cook's voice onboarding guide. Learn enough to build a personalised weekly menu. Ask ONE question at a time — warm, brief, like a smart friend. 2-3 sentences max.

Rules: ONE question per message. Never say "diet" (say "food goals"). Never invent. No JSON until the final message.

Cover in 10-12 questions: name · age · city · grew up where · cultural/food background · household + cook situation · cuisine loves · hard nos · meat preference · health goal + weight · medical restrictions · meal timing.

When done, give a warm 2-sentence wrap-up then output EXACTLY this (nothing after the closing tag):
<profile>{"personal":{"name":"","age":null,"city":"","grew_up_in":"","cultural_background":""},"household":{"members":[],"has_paid_cook":false,"cook_schedule":{"morning_minutes":null,"evening_minutes":null},"no_cook_day":null,"shared_meals":true},"body":{"current_weight_kg":null,"target_weight_kg":null,"primary_goal":""},"activity":{"level":"sedentary","description":""},"meal_timing":{"breakfast":"","lunch":"","snack":"","dinner":""},"cuisine_preferences":{"loves":[],"comfort_food":"","favourite_format":"","flavour_notes":""},"food_loves":[],"hard_nos":[],"dietary_restrictions":{"meat_preference":"","specific_avoids":[],"intolerances":[],"medical_avoids":[],"medical_context":""},"seeds_or_supplements":[],"joy_statement":"","macro_targets":{"calories":null,"protein_g":null,"carbs_g":null,"fat_g":null}}</profile>
Fill every field. Macro targets: weight loss ~1400 kcal women/~1700 men; protein 1.1g/kg target weight; carbs 37% cals; fat 30% cals.`,
  },
  meal_plan: {
    tier: 'expensive',
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 6000,
    system: `You are What to Cook's menu engine. You generate weekly menus that are joy-first, deeply personal, health-aware, cook-friendly, and varied.

Critical rules:
- Every day MUST have exactly 4 meals: breakfast, lunch, snack, dinner — never fewer
- The snack is a light evening bite (chai + something, fruit, small plate) — never skip it
- Medical avoids are ABSOLUTE — never include them anywhere, even as a garnish
- Never include any food from the hard nos list
- Only suggest dishes that actually exist and have real recipes findable on YouTube/Google
- Never invent fictional dishes
- Build entirely from what the user told you
- Rotate cuisines across the week based on what they love

Respond with valid JSON only. No markdown, no preamble.

JSON structure:
{"week_vibe":"one warm line capturing the spirit of this person's food week","days":[{"day":"Monday","vibe":"one-line mood","meals":[{"type":"breakfast","time":"9:00 am","name":"Dish name","description":"2-sentence description that makes you want to eat it (no newlines)","kcal":350,"protein_g":18,"carbs_g":40,"fat_g":10,"tags":["cuisine","format"],"allergens":[]}],"totals":{"kcal":1800,"protein_g":120}}],"groceries":[{"category":"Vegetables & Produce","items":["2 onions","1 bunch spinach"]},{"category":"Proteins","items":["200g paneer","6 eggs"]},{"category":"Pantry & Grains","items":["1 cup masoor dal","500g basmati rice"]},{"category":"Dairy & Fats","items":["1 cup yogurt","2 tbsp ghee"]}]}`,
  },
  ingredients: {
    tier: 'cheap',
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 400,
    system: `Return a JSON array of ingredients for a home-cooked serving of 2 of the given dish. Be specific with quantities and prep notes. No markdown, no preamble — only valid JSON.

Format: [{"item":"paneer","qty":"200g","prep":"cubed"},{"item":"onion","qty":"1 medium","prep":"finely chopped"}]

Rules: 5–8 ingredients max. Real, findable ingredients only. Match the Indian home-cooking context.`,
  },
  chef: {
    tier: 'cheap',
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 700,
    system: `You are What to Cook's personal chef assistant. You know the user's current weekly menu in detail. Help them swap meals, understand ingredients, adjust their week, or answer nutrition questions in a warm, direct way.

IMPORTANT — whenever the user asks for ANY change to their menu (swap a dish, change a day, adjust portions, remove something, add something), you MUST end your reply with this tag on its own line:
<changes>Specific description of exactly what to change, with enough detail to act on it.</changes>

This tag is required for changes — never skip it. For pure questions (no menu edits), omit it.
Keep responses short — 2-4 sentences max. Never clinical. Never say "diet". Match food references to the user's own cuisine and culture.`,
  },
};

const SUPABASE_URL = 'https://xvhkhknhknhhldcsmtcz.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh2aGtoa25oa25oaGxkY3NtdGN6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4Nzc0MzQsImV4cCI6MjA5NTQ1MzQzNH0.BGDkktN3gASY3YqqZANlDEcohM4EerJIw3Uhg11yifM';
const ALLOWED_ORIGINS = new Set([
  'https://app.whattocook.life',
  'https://whattocook.life',
]);

function checkRateLimit(ip, tier) {
  const now = Date.now();
  const key = ip + ':' + tier;
  const limit = tier === 'expensive' ? RATE_LIMITS.expensive : RATE_LIMITS.cheap;

  let record = rateStore.get(key);
  if (!record || now > record.resetAt) {
    record = { count: 0, resetAt: now + limit.window };
    rateStore.set(key, record);
  }
  record.count++;

  if (record.count > limit.max) {
    return {
      limited: true,
      minutesLeft: Math.ceil((record.resetAt - now) / 60000),
      isExpensive: tier === 'expensive',
    };
  }
  return { limited: false };
}

function cleanMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return [{ role: 'user', content: 'start' }];
  }

  return messages
    .filter((message) => message && (message.role === 'user' || message.role === 'assistant'))
    .slice(-24)
    .map((message) => ({
      role: message.role,
      content: String(message.content || '').slice(0, 5000),
    }));
}

function buildUserMessage(mode, body) {
  if (mode === 'meal_plan') {
    const profile = body.profile || {};
    const feedback = body.feedback ? String(body.feedback).slice(0, 1200) : '';
    const profileStr = JSON.stringify(profile).slice(0, 6000);

    return feedback
      ? `User profile: ${profileStr}\n\nFeedback on previous weekly menu: "${feedback}"\n\nGenerate a new 7-day menu incorporating this feedback.`
      : `Generate a 7-day weekly menu for this person: ${profileStr}`;
  }

  if (mode === 'chef') {
    const planSnippet = body.plan ? JSON.stringify(body.plan).slice(0, 3500) : '';
    return planSnippet ? MODE_CONFIG.chef.system + '\n\nCurrent meal plan:\n' + planSnippet : MODE_CONFIG.chef.system;
  }

  if (mode === 'ingredients') {
    const dish = String(body.dish || '').slice(0, 200);
    return `Give me the ingredients for: ${dish}`;
  }

  return MODE_CONFIG.onboarding.system;
}

function inferLegacyMode(body) {
  const system = String(body.system || '');
  if (system.includes("What to Cook's voice onboarding guide")) return 'onboarding';
  if (system.includes("What to Cook's menu engine")) return 'meal_plan';
  if (system.includes("What to Cook's personal chef assistant")) return 'chef';
  return '';
}

function isLocalRequest(req) {
  const host = String(req.headers.host || '');
  return host.startsWith('localhost:') || host.startsWith('127.0.0.1:');
}

function isAllowedLocalOrigin(origin) {
  try {
    const url = new URL(origin);
    return url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  } catch(e) {
    return false;
  }
}

async function verifySupabaseUser(req) {
  const auth = String(req.headers.authorization || '');
  if (!auth.startsWith('Bearer ')) return false;

  try {
    const response = await fetch(SUPABASE_URL + '/auth/v1/user', {
      headers: {
        apikey: SUPABASE_ANON,
        Authorization: auth,
      },
    });

    return response.ok;
  } catch(e) {
    return false;
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  const origin = String(req.headers.origin || '');
  if (ALLOWED_ORIGINS.has(origin) || isAllowedLocalOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', 'https://app.whattocook.life');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ error: 'API key not configured' });

  const body = req.body || {};
  const mode = body.mode || inferLegacyMode(body);
  const config = MODE_CONFIG[mode];

  if (!config) {
    return res.status(400).json({ error: 'unsupported_mode' });
  }

  if (config.tier === 'expensive' && !isLocalRequest(req)) {
    const isAuthed = await verifySupabaseUser(req);
    if (!isAuthed) return res.status(401).json({ error: 'auth_required' });
  }

  // Derive IP (Vercel sets x-forwarded-for)
  const ip =
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    (req.socket && req.socket.remoteAddress) ||
    'unknown';

  const rateCheck = checkRateLimit(ip, config.tier);

  if (rateCheck.limited) {
    return res.status(429).json({
      error: 'rate_limit',
      isExpensive: rateCheck.isExpensive,
      minutesLeft: rateCheck.minutesLeft,
    });
  }

  try {
    const messages = mode === 'meal_plan'
      ? [{ role: 'user', content: body.profile ? buildUserMessage(mode, body) : cleanMessages(body.messages)[0].content }]
      : cleanMessages(body.messages);

    const system = mode === 'chef'
      ? buildUserMessage(mode, body)
      : config.system;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key.trim(),
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: config.max_tokens,
        system,
        messages,
      }),
    });

    const data = await response.json();
    if (!response.ok) return res.status(400).json({ error: JSON.stringify(data) });
    return res.status(200).json({ text: data.content[0].text });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
