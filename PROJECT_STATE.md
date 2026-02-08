# SnapForge — Project State

## Status: PRODUCTION LIVE

## Live URLs
- **API**: https://screenshot-api-two-omega.vercel.app
- **Landing**: https://ni1ra.github.io/snapforge/
- **GitHub**: https://github.com/ni1ra/snapforge

## Architecture
- **Serverless**: Vercel + `@sparticuz/chromium` + `playwright-core`
- **Database**: Supabase (shared project `vzmykaiejzklgqojgfmj`)
- **Billing**: Stripe (products + payment links + webhook auto-provisioning)
- **Landing**: GitHub Pages (gh-pages branch)

## Endpoints
| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/v1/screenshot` | GET/POST | API Key | Capture screenshot |
| `/v1/usage` | GET | API Key | Check usage stats |
| `/health` | GET | None | Health check |

## Pricing
| Tier | Price | Screenshots/mo |
|------|-------|---------------|
| Free | $0 | 100 |
| Starter | $17/mo | 1,000 |
| Pro | $49/mo | 5,000 |

## Stripe IDs
- Starter: `prod_TwQ2lV41bSTJaM` / `price_1SyXCNC0PNvdZJUshrf1eGrX`
- Pro: `prod_TwQ2WQ277yF7Fs` / `price_1SyXCUC0PNvdZJUsn055oZyl`
- Starter Link: https://buy.stripe.com/cNi9AS2YffLyfXS70S2Fa2p
- Pro Link: https://buy.stripe.com/9B628qeGX42QcLGfxo2Fa2r
- Webhook: `we_1SyXEJC0PNvdZJUsBEy9ZsHp`

## Supabase Tables
- `screenshot_subscribers`: API keys, tiers, Stripe IDs, active status
- `screenshot_usage`: Per-request logging (url, format, dims, status, duration)

## Test Key
- `sf_test_eMFMdof5RaWFhb+td8j66JvPLWoxyd+i` (pro tier, founder@navi.ai)

## Key Files
- `api/screenshot.js` — Vercel serverless screenshot function
- `api/usage.js` — Usage stats endpoint
- `api/health.js` — Health check
- `server/index.js` — Express server (local/Docker deployment)
- `landing/index.html` — Full landing page
- `vercel.json` — Rewrites + function config

## Known Issues
- Vercel hobby plan: functions may have cold starts (~3-5s first request)
- `@sparticuz/chromium` may need version pinning for Vercel compatibility
- WebP format falls back to PNG (Playwright limitation on serverless)

## Next Steps
- [ ] Marketing: Reddit, HN, API directories
- [ ] Custom domain (api.snapforge.dev)
- [ ] Rate limiting (per-minute, not just monthly)
- [ ] Response caching for repeated URLs
- [ ] Dashboard UI for subscribers
