# SnapForge - Screenshot API for Developers

Capture any webpage as **PNG, JPEG, WebP, or PDF** with a single API call.

## Features

- Full-page screenshots
- Dark mode injection
- Element-specific capture via CSS selectors
- Ad & tracker blocking
- Device scaling (retina)
- PDF export
- Custom viewport dimensions

## Quick Start

```bash
curl "https://api.snapforge.dev/v1/screenshot?url=https://example.com&format=png" \
  -H "X-API-Key: your_api_key"
```

## Pricing

| Plan | Price | Screenshots/mo |
|------|-------|---------------|
| Free | $0 | 100 |
| Starter | $17/mo | 1,000 |
| Pro | $49/mo | 5,000 |

## Self-Hosting

```bash
cd server
cp .env.example .env
# Edit .env with your Supabase credentials
npm install
npx playwright install chromium
npm start
```

## API Reference

See the [full documentation](https://ni1ra.github.io/snapforge/).

## License

MIT
