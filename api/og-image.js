const chromium = require('@sparticuz/chromium');
const playwright = require('playwright-core');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

const TIER_LIMITS = { free: 100, starter: 1000, pro: 5000 };

async function supabaseQuery(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: opts.method === 'POST' ? 'return=minimal' : undefined,
      ...opts.headers,
    },
  });
  if (!res.ok && opts.method !== 'POST') throw new Error(`Supabase ${res.status}`);
  if (opts.method === 'POST') return null;
  return res.json();
}

function generateOgHtml(params) {
  const {
    title = 'Hello World',
    description = '',
    theme = 'dark',
    accent = '#6366f1',
    logo = '',
    author = '',
    site = '',
    pattern = 'dots',
  } = params;

  const isDark = theme === 'dark';
  const bg = isDark ? '#0f0f1a' : '#ffffff';
  const text = isDark ? '#e0e0e8' : '#1a1a2e';
  const muted = isDark ? '#8888a0' : '#666680';
  const surface = isDark ? '#1a1a2e' : '#f0f0f5';

  const patternSvg = pattern === 'dots'
    ? `<pattern id="p" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="10" cy="10" r="1" fill="${isDark ? '#ffffff10' : '#00000010'}"/></pattern>`
    : pattern === 'grid'
    ? `<pattern id="p" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0v40" fill="none" stroke="${isDark ? '#ffffff08' : '#00000008'}" stroke-width="1"/></pattern>`
    : '';

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 1200px; height: 630px;
    font-family: 'Inter', -apple-system, sans-serif;
    background: ${bg};
    color: ${text};
    display: flex;
    position: relative;
    overflow: hidden;
  }
  .bg-pattern {
    position: absolute; inset: 0;
  }
  .accent-bar {
    position: absolute; top: 0; left: 0; right: 0; height: 4px;
    background: linear-gradient(90deg, ${accent}, ${accent}88);
  }
  .content {
    position: relative; z-index: 1;
    padding: 60px 80px;
    display: flex; flex-direction: column; justify-content: center;
    width: 100%;
  }
  .logo-row {
    display: flex; align-items: center; gap: 12px;
    margin-bottom: 32px;
  }
  .logo-row img { width: 40px; height: 40px; border-radius: 8px; }
  .site-name { font-size: 18px; color: ${muted}; font-weight: 600; }
  h1 {
    font-size: ${title.length > 60 ? '42px' : title.length > 40 ? '52px' : '64px'};
    font-weight: 800;
    line-height: 1.15;
    letter-spacing: -0.02em;
    margin-bottom: 20px;
    max-width: 900px;
  }
  .description {
    font-size: 22px;
    color: ${muted};
    line-height: 1.5;
    max-width: 700px;
  }
  .author {
    margin-top: auto;
    padding-top: 24px;
    font-size: 16px;
    color: ${muted};
    font-weight: 600;
  }
  .accent-dot {
    display: inline-block;
    width: 8px; height: 8px;
    background: ${accent};
    border-radius: 50%;
    margin-right: 8px;
  }
</style></head>
<body>
  ${patternSvg ? `<svg class="bg-pattern" width="1200" height="630">${patternSvg}<rect width="1200" height="630" fill="url(#p)"/></svg>` : ''}
  <div class="accent-bar"></div>
  <div class="content">
    ${logo || site ? `<div class="logo-row">${logo ? `<img src="${logo}" alt="">` : ''}<span class="site-name">${site}</span></div>` : ''}
    <h1>${title}</h1>
    ${description ? `<p class="description">${description}</p>` : ''}
    ${author ? `<div class="author"><span class="accent-dot"></span>${author}</div>` : ''}
  </div>
</body></html>`;
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'X-API-Key, Content-Type');
    return res.status(200).end();
  }

  res.setHeader('Access-Control-Allow-Origin', '*');

  const apiKey = req.headers['x-api-key'] || req.query.api_key;
  if (!apiKey) return res.status(401).json({ error: 'Missing API key' });

  const rows = await supabaseQuery(
    `screenshot_subscribers?api_key=eq.${encodeURIComponent(apiKey)}&is_active=eq.true&select=*`
  );
  if (!rows || rows.length === 0) return res.status(403).json({ error: 'Invalid API key' });

  const subscriber = rows[0];
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  const usage = await supabaseQuery(
    `screenshot_usage?subscriber_id=eq.${subscriber.id}&created_at=gte.${start.toISOString()}&select=id`
  );
  const count = Array.isArray(usage) ? usage.length : 0;
  const limit = TIER_LIMITS[subscriber.tier] || 100;
  if (count >= limit) return res.status(429).json({ error: 'Monthly limit reached' });

  const params = req.method === 'POST' ? req.body : req.query;
  const html = generateOgHtml(params);

  const startTime = Date.now();
  let browser = null;

  try {
    browser = await playwright.chromium.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });

    const page = await browser.newPage();
    await page.setViewportSize({ width: 1200, height: 630 });
    await page.setContent(html, { waitUntil: 'networkidle' });

    const format = params.format || 'png';
    const buffer = await page.screenshot({
      type: format === 'jpeg' ? 'jpeg' : 'png',
      quality: format === 'jpeg' ? (parseInt(params.quality) || 90) : undefined,
    });

    await browser.close();
    browser = null;

    const durationMs = Date.now() - startTime;
    await supabaseQuery('screenshot_usage', {
      method: 'POST',
      body: JSON.stringify({
        subscriber_id: subscriber.id,
        url: `og-image:${(params.title || '').substring(0, 100)}`,
        format, width: 1200, height: 630, status: 'ok', duration_ms: durationMs,
      }),
    });

    const ct = format === 'jpeg' ? 'image/jpeg' : 'image/png';
    res.setHeader('Content-Type', ct);
    res.setHeader('X-Duration-Ms', durationMs);
    return res.status(200).send(buffer);
  } catch (err) {
    if (browser) await browser.close().catch(() => {});
    return res.status(500).json({ error: 'OG image generation failed', message: err.message });
  }
};
