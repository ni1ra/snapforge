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
  if (!res.ok && opts.method !== 'POST') {
    const text = await res.text();
    throw new Error(`Supabase ${res.status}: ${text}`);
  }
  if (opts.method === 'POST') return null;
  return res.json();
}

async function validateApiKey(apiKey) {
  const rows = await supabaseQuery(
    `screenshot_subscribers?api_key=eq.${encodeURIComponent(apiKey)}&is_active=eq.true&select=*`
  );
  if (!rows || rows.length === 0) return null;
  return rows[0];
}

async function getMonthlyUsage(subscriberId) {
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  const rows = await supabaseQuery(
    `screenshot_usage?subscriber_id=eq.${subscriberId}&created_at=gte.${start.toISOString()}&select=id`,
    { headers: { Prefer: 'count=exact' } }
  );
  return Array.isArray(rows) ? rows.length : 0;
}

async function logUsage(subscriberId, url, format, width, height, status, durationMs) {
  await supabaseQuery('screenshot_usage', {
    method: 'POST',
    body: JSON.stringify({
      subscriber_id: subscriberId,
      url, format, width, height, status,
      duration_ms: durationMs,
    }),
  });
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'X-API-Key, Content-Type');
    return res.status(200).end();
  }

  res.setHeader('Access-Control-Allow-Origin', '*');

  // Auth
  const apiKey = req.headers['x-api-key'] || req.query.api_key;
  if (!apiKey) return res.status(401).json({ error: 'Missing API key' });

  let subscriber;
  try {
    subscriber = await validateApiKey(apiKey);
  } catch (e) {
    return res.status(500).json({ error: 'Auth service error' });
  }
  if (!subscriber) return res.status(403).json({ error: 'Invalid or inactive API key' });

  // Usage check
  const usage = await getMonthlyUsage(subscriber.id);
  const limit = TIER_LIMITS[subscriber.tier] || 100;
  if (usage >= limit) {
    return res.status(429).json({ error: 'Monthly limit reached', usage, limit, tier: subscriber.tier });
  }

  // Parse params
  const params = req.method === 'POST' ? req.body : req.query;
  const url = params.url;
  if (!url) return res.status(400).json({ error: 'Missing url parameter' });

  const format = params.format || 'png';
  const width = parseInt(params.width) || 1280;
  const height = parseInt(params.height) || 720;
  const fullPage = params.full_page === true || params.full_page === 'true';
  const darkMode = params.dark_mode === true || params.dark_mode === 'true';
  const selector = params.selector || null;
  const quality = parseInt(params.quality) || (format === 'jpeg' ? 80 : undefined);
  const delay = Math.min(parseInt(params.delay) || 0, 10000);
  const deviceScale = Math.min(parseFloat(params.device_scale) || 1, 3);
  const blockAds = params.block_ads === true || params.block_ads === 'true';

  if (!['png', 'jpeg', 'webp', 'pdf'].includes(format)) {
    return res.status(400).json({ error: 'Invalid format. Use: png, jpeg, webp, pdf' });
  }

  const startTime = Date.now();
  let browser = null;

  try {
    browser = await playwright.chromium.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });

    const context = await browser.newContext({
      viewport: { width, height },
      deviceScaleFactor: deviceScale,
      colorScheme: darkMode ? 'dark' : 'light',
    });

    const page = await context.newPage();

    if (blockAds) {
      await page.route('**/*', (route) => {
        const u = route.request().url();
        if (/doubleclick|googlesyndication|adservice|facebook.*pixel|analytics/i.test(u)) {
          return route.abort();
        }
        return route.continue();
      });
    }

    await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });

    if (delay > 0) await page.waitForTimeout(delay);

    let buffer;
    if (format === 'pdf') {
      buffer = await page.pdf({ format: 'A4', printBackground: true });
    } else if (selector) {
      const el = await page.$(selector);
      if (!el) {
        await logUsage(subscriber.id, url, format, width, height, 'error', Date.now() - startTime);
        return res.status(400).json({ error: `Selector not found: ${selector}` });
      }
      buffer = await el.screenshot({ type: format === 'webp' ? 'png' : format, quality });
    } else {
      buffer = await page.screenshot({
        type: format === 'webp' ? 'png' : format,
        quality,
        fullPage,
      });
    }

    await browser.close();
    browser = null;

    const durationMs = Date.now() - startTime;
    await logUsage(subscriber.id, url, format, width, height, 'ok', durationMs);

    const contentTypes = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp', pdf: 'application/pdf' };
    res.setHeader('Content-Type', contentTypes[format]);
    res.setHeader('X-Duration-Ms', durationMs);
    res.setHeader('X-Usage', `${usage + 1}/${limit}`);
    return res.status(200).send(buffer);
  } catch (err) {
    if (browser) await browser.close().catch(() => {});
    await logUsage(subscriber.id, url, format, width, height, 'error', Date.now() - startTime).catch(() => {});
    return res.status(500).json({ error: 'Screenshot failed', message: err.message });
  }
};
