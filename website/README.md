# VibePrint OS — Marketing & Docs Website

Static marketing site built with Astro + React + Tailwind CSS.

## Quick Start

```bash
npm install
npm run dev        # http://localhost:4321
```

## Build

```bash
npm run build      # outputs to dist/
npm run preview    # preview the built site
```

## Docker

```bash
# Build and run
docker build -t vibeprint-website .
docker run -p 3000:80 vibeprint-website

# Or with docker compose (from this directory)
docker compose up --build
```

The site runs on **port 3000** by default.

## Pages

| Path | Description |
|------|-------------|
| `/` | Landing page (hero, features, how it works, tech stack) |
| `/docs` | Documentation overview |
| `/docs/getting-started` | Installation and setup guide |
| `/docs/architecture` | System architecture overview |
| `/docs/configuration` | Configuration reference |
| `/docs/deployment` | Docker deployment guide |
| `/docs/api-reference` | API endpoint reference |
| `/docs/development` | Contributing and dev setup |
| `/docs/troubleshooting` | FAQ and common issues |
| `/gallery` | Demo gallery |

## Gallery Images

Place demo images and GIFs in `public/images/gallery/`. Recommended files:

- `demo-vibe-check.gif` — Screen recording of a vibe check session
- `demo-photobooth.gif` — Screen recording of a photobooth session
- `demo-admin.png` — Admin dashboard screenshot
- `demo-receipt.jpg` — Photo of a printed thermal receipt
- `demo-strip.jpg` — Photo of a printed photobooth strip

Update `src/data/gallery.ts` to match your actual filenames.

## Tech Stack

- **Astro 5** — Static site generator (zero JS by default)
- **React 19** — Interactive islands only (mobile menu, code copy, gallery filter)
- **Tailwind CSS 4** — Styling, matching the kiosk app's dark purple theme
- **nginx** — Production serving with gzip and security headers
