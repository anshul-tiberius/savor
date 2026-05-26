// ── In-memory rate limiting ──────────────────────────────────────────────────
// Two tiers to protect API budget without frustrating real users:
//   cheap    (max_tokens ≤ 1500) — onboarding + Ask Chef chat: 30/IP/hour
//   expensive (max_tokens > 3000) — meal plan generation:       3/IP/6 hours
//
// Stored in a Map that lives for the lifetime of the serverless instance.
// Not perfect (resets on cold start) but deters automated abuse with zero
// external infrastructure.

const rateStore = new Map();
const RATE_LIMITS = {
  cheap:     { window: 60 * 60 * 1000,     max: 30 },
  expensive: { window: 6 * 60 * 60 * 1000, max: 3  },
};

function checkRateLimit(ip, isExpensive) {
  const now = Date.now();
  const key = ip + ':' + (isExpensive ? 'exp' : 'chp');
  const limit = isExpensive ? RATE_LIMITS.expensive : RATE_LIMITS.cheap;

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
      isExpensive,
    };
  }
  return { limited: false };
}

// ── Handler ───────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ error: 'API key not configured' });

  const { system, messages, max_tokens, model } = req.body;

  // Derive IP (Vercel sets x-forwarded-for)
  const ip =
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    (req.socket && req.socket.remoteAddress) ||
    'unknown';

  const isExpensive = (max_tokens || 0) > 3000;
  const rateCheck = checkRateLimit(ip, isExpensive);

  if (rateCheck.limited) {
    return res.status(429).json({
      error: 'rate_limit',
      isExpensive: rateCheck.isExpensive,
      minutesLeft: rateCheck.minutesLeft,
    });
  }

  try {
    const msgs = (messages && messages.length > 0)
      ? messages
      : [{ role: 'user', content: 'start' }];

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key.trim(),
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: model || 'claude-sonnet-4-6',
        max_tokens: max_tokens || 1000,
        system,
        messages: msgs,
      }),
    });

    const data = await response.json();
    if (!response.ok) return res.status(400).json({ error: JSON.stringify(data) });
    return res.status(200).json({ text: data.content[0].text });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
