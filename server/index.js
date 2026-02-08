// SnapForge — Screenshot & OG Image API
// Architecture: Express + Playwright (self-hosted worker)
// Auth: API key validated against Supabase screenshot_subscribers table
// Billing: Usage tracked per key, enforced by tier limits

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { chromium } = require('playwright');

const app = express();
app.use(cors());
app.use(express.json());

// --- Config ---
const PORT = process.env.PORT || 3100;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Rate limits by tier
const TIER_LIMITS = {
  free:    { monthly: 100,  max_width: 1280, max_height: 1024, formats: ['png', 'jpeg'] },
  starter: { monthly: 1000, max_width: 1920, max_height: 1080, formats: ['png', 'jpeg', 'pdf'] },
  pro:     { monthly: 5000, max_width: 3840, max_height: 2160, formats: ['png', 'jpeg', 'pdf'] },
};

// --- Browser pool ---
let browser = null;

async function getBrowser() {
  if (!browser || !browser.isConnected()) {
    browser = await chromium.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
  }
  return browser;
}

// --- Supabase helpers ---
async function supabaseQuery(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': options.prefer || 'return=representation',
    },
    method: options.method || 'GET',
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase ${res.status}: ${text}`);
  }
  return res.json();
}

async function validateApiKey(apiKey) {
  if (!apiKey) return null;
  const rows = await supabaseQuery(
    `screenshot_subscribers?api_key=eq.${encodeURIComponent(apiKey)}&is_active=eq.true&select=*`
  );
  return rows.length > 0 ? rows[0] : null;
}

async function getMonthlyUsage(subscriberId) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const rows = await supabaseQuery(
    `screenshot_usage?subscriber_id=eq.${subscriberId}&created_at=gte.${monthStart}&select=id`,
    { prefer: 'return=representation,count=exact' }
  );
  return rows.length;
}

async function logUsage(subscriberId, url, format, width, height, status, durationMs) {
  await supabaseQuery('screenshot_usage', {
    method: 'POST',
    body: {
      subscriber_id: subscriberId,
      url,
      format,
      width,
      height,
      status,
      duration_ms: durationMs,
    },
  });
}

// --- Auth middleware ---
async function authMiddleware(req, res, next) {
  const apiKey = req.headers['x-api-key'] || req.query.api_key;

  if (!apiKey) {
    return res.status(401).json({ error: 'Missing API key. Pass via X-API-Key header or api_key query param.' });
  }

  const subscriber = await validateApiKey(apiKey);
  if (!subscriber) {
    return res.status(403).json({ error: 'Invalid or inactive API key.' });
  }

  const tier = TIER_LIMITS[subscriber.tier] || TIER_LIMITS.free;
  const usage = await getMonthlyUsage(subscriber.id);

  if (usage >= tier.monthly) {
    return res.status(429).json({
      error: 'Monthly quota exceeded.',
      usage: usage,
      limit: tier.monthly,
      tier: subscriber.tier,
    });
  }

  req.subscriber = subscriber;
  req.tier = tier;
  req.currentUsage = usage;
  next();
}

// --- Screenshot endpoint ---
app.post('/v1/screenshot', authMiddleware, async (req, res) => {
  const start = Date.now();
  const {
    url,
    format = 'png',
    width = 1280,
    height = 800,
    full_page = false,
    delay = 0,
    selector,
    dark_mode = false,
    device_scale = 1,
    block_ads = false,
  } = req.body;

  // Validate URL
  if (!url) {
    return res.status(400).json({ error: 'Missing required field: url' });
  }

  try {
    new URL(url);
  } catch {
    return res.status(400).json({ error: 'Invalid URL format.' });
  }

  // Validate format
  const allowedFormats = req.tier.formats;
  if (!allowedFormats.includes(format)) {
    return res.status(400).json({ error: `Format '${format}' not available on your tier. Allowed: ${allowedFormats.join(', ')}` });
  }

  // Clamp dimensions
  const w = Math.min(Math.max(width, 320), req.tier.max_width);
  const h = Math.min(Math.max(height, 200), req.tier.max_height);
  const clampedDelay = Math.min(Math.max(delay, 0), 10000); // max 10s delay
  const scale = Math.min(Math.max(device_scale, 1), 3);

  let page = null;
  try {
    const b = await getBrowser();
    const context = await b.newContext({
      viewport: { width: w, height: h },
      deviceScaleFactor: scale,
      colorScheme: dark_mode ? 'dark' : 'light',
    });

    page = await context.newPage();

    // Block ads/trackers if requested
    if (block_ads) {
      await page.route('**/*', (route) => {
        const url = route.request().url();
        const blocked = /ads|analytics|tracker|doubleclick|googlesyndication|facebook.*pixel/i.test(url);
        return blocked ? route.abort() : route.continue();
      });
    }

    // Navigate with timeout
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

    // Optional delay (wait for animations, lazy-loaded content)
    if (clampedDelay > 0) {
      await page.waitForTimeout(clampedDelay);
    }

    let screenshotOptions = { type: format === 'pdf' ? 'png' : format };

    if (format === 'pdf') {
      // PDF generation
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '0.5in', right: '0.5in', bottom: '0.5in', left: '0.5in' },
      });
      const duration = Date.now() - start;
      await logUsage(req.subscriber.id, url, 'pdf', w, h, 'ok', duration);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'inline; filename="screenshot.pdf"');
      return res.send(pdfBuffer);
    }

    // Screenshot (PNG or JPEG)
    let element = page;
    if (selector) {
      try {
        element = await page.locator(selector).first();
        await element.waitFor({ timeout: 5000 });
      } catch {
        return res.status(400).json({ error: `Selector '${selector}' not found on page.` });
      }
    }

    const imgBuffer = await (selector ? element : page).screenshot({
      type: format,
      fullPage: full_page && !selector,
      quality: format === 'jpeg' ? 85 : undefined,
    });

    const duration = Date.now() - start;
    await logUsage(req.subscriber.id, url, format, w, h, 'ok', duration);

    const contentType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
    res.setHeader('Content-Type', contentType);
    res.setHeader('X-Screenshot-Duration-Ms', duration);
    res.setHeader('X-Monthly-Usage', `${req.currentUsage + 1}/${req.tier.monthly}`);
    res.send(imgBuffer);

    await context.close();
  } catch (err) {
    const duration = Date.now() - start;
    await logUsage(req.subscriber.id, url, format, w, h, 'error', duration).catch(() => {});
    console.error(`Screenshot error for ${url}:`, err.message);
    res.status(500).json({ error: 'Screenshot failed.', detail: err.message });
    if (page) await page.context().close().catch(() => {});
  }
});

// --- GET convenience endpoint (for simple integrations) ---
app.get('/v1/screenshot', authMiddleware, async (req, res) => {
  // Convert query params to body-like format and reuse POST handler
  req.body = {
    url: req.query.url,
    format: req.query.format || 'png',
    width: parseInt(req.query.width) || 1280,
    height: parseInt(req.query.height) || 800,
    full_page: req.query.full_page === 'true',
    delay: parseInt(req.query.delay) || 0,
    selector: req.query.selector,
    dark_mode: req.query.dark_mode === 'true',
    device_scale: parseFloat(req.query.device_scale) || 1,
    block_ads: req.query.block_ads === 'true',
  };
  // Re-run through POST handler
  app.handle(Object.assign(req, { method: 'POST' }), res);
});

// --- Usage endpoint ---
app.get('/v1/usage', authMiddleware, async (req, res) => {
  const tier = req.tier;
  res.json({
    tier: req.subscriber.tier,
    usage: req.currentUsage,
    limit: tier.monthly,
    remaining: tier.monthly - req.currentUsage,
    reset: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toISOString(),
  });
});

// --- Health check ---
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'snapforge',
    version: '1.0.0',
    browser: browser?.isConnected() ? 'ready' : 'cold',
  });
});

// --- Docs redirect ---
app.get('/', (req, res) => {
  res.json({
    name: 'SnapForge Screenshot API',
    version: '1.0.0',
    docs: 'https://snapforge.dev/docs',
    endpoints: {
      screenshot: 'POST /v1/screenshot',
      usage: 'GET /v1/usage',
      health: 'GET /health',
    },
  });
});

// --- Start ---
app.listen(PORT, () => {
  console.log(`[SnapForge] Screenshot API running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  if (browser) await browser.close();
  process.exit(0);
});
