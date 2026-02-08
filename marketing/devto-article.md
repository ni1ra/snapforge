---
title: "How I Built a Screenshot API in a Day (and Why Existing Ones Are Overpriced)"
published: false
tags: webdev, api, javascript, tutorial
---

# How I Built a Screenshot API in a Day

Every developer has hit this problem: you need to turn a URL into an image. Maybe for:
- Social media OG images
- Link preview thumbnails
- Automated visual regression testing
- PDF generation from web pages

The existing solutions? **Screenshotlayer** charges $40/mo for 5K screenshots. **URL2PNG** wants $29/mo for 1K. **Apiflash** is $25/mo for 1K.

I thought: Playwright can take screenshots for free. Why am I paying someone to run `page.screenshot()`?

## The Architecture

SnapForge runs on **Vercel serverless functions** with `@sparticuz/chromium` (a Lambda-optimized Chromium build) and `playwright-core`.

Each screenshot request:
1. Validates your API key against Supabase
2. Checks your monthly usage quota
3. Launches Chromium (cold) or reuses the warm instance
4. Navigates to the URL with `networkidle` wait
5. Captures the screenshot with your specified options
6. Logs the usage and returns the image

**Total infrastructure cost: $0.** Vercel free tier handles the compute, Supabase free tier handles the auth/usage tracking.

## The API

```javascript
const res = await fetch('https://screenshot-api-two-omega.vercel.app/v1/screenshot', {
  method: 'POST',
  headers: {
    'X-API-Key': 'your_api_key',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    url: 'https://github.com',
    format: 'png',
    width: 1280,
    full_page: true,
    dark_mode: true
  })
});

const imageBlob = await res.blob();
```

## Features That Actually Matter

| Feature | Why |
|---------|-----|
| **Dark mode** | Inject `prefers-color-scheme: dark` for styled captures |
| **Element selectors** | Screenshot just `#hero` or `.pricing-table` |
| **Ad blocking** | Strip tracking pixels and ad iframes |
| **PDF export** | Full A4 PDF with background graphics |
| **Device scaling** | 2x/3x for retina displays |

## Try It Free

100 screenshots/month, no credit card required.

**Landing page:** [ni1ra.github.io/snapforge](https://ni1ra.github.io/snapforge/)

---

What screenshot features would be most useful for your workflow? Drop a comment below.
