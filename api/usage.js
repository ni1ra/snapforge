const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

const TIER_LIMITS = { free: 100, starter: 1000, pro: 5000 };

async function supabaseQuery(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}`);
  return res.json();
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const apiKey = req.headers['x-api-key'] || req.query.api_key;
  if (!apiKey) return res.status(401).json({ error: 'Missing API key' });

  const rows = await supabaseQuery(
    `screenshot_subscribers?api_key=eq.${encodeURIComponent(apiKey)}&is_active=eq.true&select=*`
  );
  if (!rows || rows.length === 0) return res.status(403).json({ error: 'Invalid API key' });

  const sub = rows[0];
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);

  const usage = await supabaseQuery(
    `screenshot_usage?subscriber_id=eq.${sub.id}&created_at=gte.${start.toISOString()}&select=id`
  );

  const limit = TIER_LIMITS[sub.tier] || 100;
  const count = Array.isArray(usage) ? usage.length : 0;
  const reset = new Date(start);
  reset.setMonth(reset.getMonth() + 1);

  return res.status(200).json({
    tier: sub.tier,
    usage: count,
    limit,
    remaining: Math.max(0, limit - count),
    reset: reset.toISOString(),
  });
};
