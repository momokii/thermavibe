# VibePrint OS — Marketing & Docs Website

Static marketing site built with Astro + React + Tailwind CSS.

## Development

```bash
npm install
npm run dev        # http://localhost:4321
```

The Astro dev toolbar appears at the bottom during development. It does not appear in production builds.

## Production

### Docker Compose (recommended)

```bash
docker compose up -d --build
```

The site is served by nginx on **port 3000** with gzip compression and security headers.

```bash
docker compose down        # Stop
docker compose up -d --build  # Rebuild and restart
```

### Docker (manual)

```bash
docker build -t vibeprint-website .
docker run -d -p 3000:80 --name vibeprint-website vibeprint-website
```

### Static build (for Vercel, Netlify, etc.)

```bash
npm run build      # outputs to dist/
npm run preview    # preview locally
```

Serve `dist/` with any static file server.

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
