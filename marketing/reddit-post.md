# Reddit Post — r/SideProject + r/webdev

## Title
I built a screenshot API because existing ones charge $50+ for basic URL-to-image conversion

## Body

Hey everyone,

I've been working on various projects that needed URL-to-screenshot functionality (social media cards, link previews, automated testing). Every existing API either:

- Charges way too much for simple screenshots ($50-100/mo for 1K captures)
- Has terrible quality / slow rendering
- Requires complex setup with queues and callbacks

So I built **SnapForge** — a dead-simple screenshot API.

**One request, one image:**
```
curl "https://screenshot-api-two-omega.vercel.app/v1/screenshot?url=https://github.com&format=png" \
  -H "X-API-Key: your_key"
```

**Features:**
- PNG, JPEG, WebP, PDF output
- Full-page captures
- Dark mode injection
- CSS selector targeting (screenshot just a specific element)
- Ad & tracker blocking
- Custom viewports + retina scaling
- ~2-5 second response times

**Pricing:**
- Free: 100 screenshots/month (no credit card)
- Starter: $17/mo (1,000/month)
- Pro: $49/mo (5,000/month)

Built with Playwright + Chromium on serverless infra. Zero third-party dependencies — we render everything ourselves.

**Landing page:** https://ni1ra.github.io/snapforge/

I'd love feedback on the API design and pricing. What features would make this more useful for your projects?

---

# Crosspost to r/InternetIsBeautiful

## Title
SnapForge — Turn any URL into a screenshot with one API call (free tier included)
