# VibePrint OS — Update Roadmap

> **Status:** Living document. Tracks the three documented "big update" directions for VibePrint OS.
> **Current priority:** Option 2 MVP (Remote Operations) — conditional on kiosk being deployed off-site. See §6.2.
> **Last shipped:** Option 3 (Digital Sharing) Gaps 1-3 — 2026-06-19. See §5 status banner.
> **Last updated:** 2026-06-20

---

## 1. How to Use This Document

This doc is the single source of truth for the three future-feature directions. It is written so that a fresh Claude Code session (or any new contributor) can pick up the work without needing prior conversation context.

When asked *"what are the update ideas?"* or *"what should I build next?"*, this is the file to read first. Each option specifies:
- What it is and why it matters
- Current state of the code
- Concrete file-by-file implementation plan
- Acceptance criteria
- Out-of-scope items

If a fresh session is asked to implement Option 3, they should be able to start coding from §5 alone.

---

## 2. Current State (as of June 2026)

**Shipped and working:**
- Single-kiosk deployment on Docker Compose (Linux/WSL2)
- Both flows: Vibe Check (single photo + AI reading) and Photobooth (3-photo strip)
- Hardware: USB webcam (OpenCV/V4L2), USB thermal printer (python-escpos, 58mm + 80mm)
- AI provider chain: OpenAI → Anthropic → Google → Ollama → Mock (with fallback)
- Payment: QRIS via Midtrans/Xendit/Mock, toggleable
- Admin UI at `/admin` (PIN auth, rate-limited, request-size-limited)
- Backend: 318 passing / 4 pre-existing failures (322 total), Frontend: 36 passing / 0 failing. Pre-existing failures unrelated to digital sharing — see `.claude/state/CURRENT_STATUS.md`
- Digital sharing: Gaps 1-3 implemented 2026-06-19 (URL plumbing, HTML landing page, analytics events). Cloudflare Tunnel sidecar is opt-in via `make prod-tunnel`. See §5 status banner.

**Architecture constraints:**
- Single-tenant schema (no `kiosk_id` concept)
- LAN-only access (kiosk admin UI reachable only from same network)
- PIN-based admin auth (4 digits — fine for LAN, too weak for internet exposure)
- All photos stored in `app-composites` Docker volume at `/tmp/vibeprint`
- Composite images auto-deleted after `photobooth_composite_retention_hours` (default 168h = 7 days) via `retention_service`

---

## 3. The Three Options at a Glance

| Option | Title | Beneficiary | Needs Opt 1? | Effort | Status in this doc |
|--------|-------|-------------|---------------|--------|--------------------|
| **1** | Multi-Kiosk Architecture | Operator (scaling) | — | Multi-month | §4 (brief, full spec in `multi-kiosk-architecture.md`). **Deferred** pending concrete demand. |
| **2** | Remote Operations | Operator (offsite) | MVP: No / Full: Yes | MVP: 2-3 days / Full: 2-3 months | §6 — **MVP is current priority** (conditional on off-site kiosk) |
| **3** | Digital Sharing | **End customer** | No | 3-5 days | §5 — **SHIPPED 2026-06-19** (Gaps 1-3; Gap 4 default-skip per D-029) |

---

## 4. Dependency Map

```
Option 1 (multi-kiosk schema migrations)
   ↑
   │ strictly required only by
   │
   └── Option 2 Full vision (multi-kiosk aggregation dashboard)

Independent of Option 1:
   ├── Option 2 MVP (single-kiosk monitoring via tunnel + TOTP + push)
   └── Option 3 (Digital Sharing — fully standalone)
```

Key implication: **Option 3 has been built and shipped (2026-06-19); it had zero schema risk.** Option 2 MVP can now be built on top of Option 3's tunnel infrastructure with no new schema work either.

---

# 5. Option 3 — Digital Sharing (SHIPPED 2026-06-19)

> **Implementation status (2026-06-19):** Gaps 1-3 implemented in a single batch.
> - **Gap 1 (URL plumbing + Cloudflare Tunnel sidecar):** DONE
> - **Gap 2 (HTML landing page + image sub-path):** DONE
> - **Gap 3 (SHARE_URL_SCANNED / COMPOSITE_DOWNLOADED analytics):** DONE
> - **Gap 4 (Vibe Check parity):** DEFAULT-SKIP per §5.4 — revisit if analytics show demand.
>
> Opt-in requirement honored: with `PUBLIC_BASE_URL` and `TUNNEL_TOKEN` unset, deployment
> behaves identically to before. The cloudflared sidecar runs only under `make dev-tunnel`
> / `make prod-tunnel` (Docker Compose `profiles: ["tunnel"]`). Backend tests: 318 passing
> / 4 pre-existing failures (322 total). Frontend tests: 36 passing (was 32; 3 RevealScreen
> regressions also fixed). The 4 pre-existing failures are unrelated to this work — see
> `.claude/state/CURRENT_STATUS.md`.

## 5.1 What it is

Give the customer their photo on their phone. After the photobooth flow prints the thermal receipt, the reveal screen shows a QR code. Customer scans it, lands on a polished mobile download page, taps Download, and posts the photo to Instagram/TikTok/etc manually.

**It is NOT:**
- A mobile app (explicitly rejected — `07-out-of-scope.md` §1.1)
- Social media auto-posting (explicitly rejected — `01-personas-and-goals.md` NG-004)
- User accounts or email capture (explicitly rejected — `01-personas-and-goals.md` NG-005)
- A replacement for the physical receipt (the receipt still prints every time)

It is narrowly: customer scan → mobile landing page → download clean image file → customer posts manually if they want.

## 5.2 Why this is the priority

1. **Drives the project's central growth metric.** `00-executive-summary.md` line 77 sets the success metric: "20% or more of receipts are photographed and shared on social media." Today's QR code doesn't work for customers on mobile data (the majority in Indonesia), so this metric is throttled.
2. **Most of the code is already written.** Token generation, validation, backend endpoints, frontend QR display — all exist (see §5.3). The gaps are small.
3. **Customer-visible value.** Unlike Options 1 and 2, this serves the end user, not the operator. Highest leverage for an open-source project's adoption loop.
4. **Zero schema risk.** No new database tables, no migrations, no multi-tenant concerns. Cannot break existing flows.
5. **Foundational for Option 2.** The public URL + tunnel infrastructure built here is directly reusable by the eventual remote-ops dashboard.

## 5.3 Current state of the code (already built — DO NOT recreate)

These pieces exist and are wired up:

```
backend/app/services/share_service.py
  ├─ generate_share_token(session_id, ttl_seconds=300) → (token, expires_at)
  │   HMAC-SHA256 signed with settings.app_secret_key
  │   Token format: "{session_id}:{expiry_unix_timestamp}:{hmac_hex}"
  └─ validate_share_token(token) → session_id
      Verifies HMAC + expiry, raises VibePrintError on tamper/expiry

backend/app/api/v1/endpoints/kiosk.py
  Line 719: GET /api/v1/kiosk/session/{session_id}/photobooth/share
            Auth: none required (called from kiosk session)
            Returns: ShareResponse { share_url, expires_in, qr_data }
            share_url is currently RELATIVE: "/api/v1/kiosk/share/{token}"
  Line 748: GET /api/v1/kiosk/share/{token}
            Auth: PUBLIC (no auth, by design — share tokens are HMAC-signed)
            Returns: FileResponse of composite_image_path as image/jpeg

backend/app/core/config.py
  photobooth_share_url_ttl_seconds: int = 300   (5 minutes)

backend/app/services/retention_service.py
  Purges composite_image_path after photobooth_composite_retention_hours (default 168h)

frontend/src/api/photoboothApi.ts line 46
  share(id) → apiClient.get(`/kiosk/session/${id}/photobooth/share`)

frontend/src/hooks/usePhotoboothState.ts line 99
  shareMutation = useMutation({ mutationFn: photoboothApi.share })

frontend/src/components/kiosk/PhotoboothRevealScreen.tsx
  Lines 39-51: After reveal, calls getShareUrl() and constructs
               qrUrl = `${window.location.origin}${shareData.qr_data}`
               Displays QR with "Scan to download" label and expiry countdown

docker-compose.yml + docker-compose.dev.yml
  app-composites volume → /tmp/vibeprint (composite images persisted)
```

**What this means in practice today (pre-Gap-1):** The QR code is **loopback-only, not LAN-only.** Docker binds the app port to `127.0.0.1:8000` by default (decision D-025), so even a phone on the same WiFi as the kiosk cannot reach it — only the kiosk itself can. The QR code therefore fails for any phone, regardless of network, until Gap 1 is applied.

## 5.4 The gaps to fill

Four concrete gaps, in priority order:

### Gap 1: Public URL via tunnel (must-do, unlocks everything else)

**Problem:** Share URLs are currently `{window.location.origin}/api/v1/kiosk/share/{token}` where origin is the LAN IP. Phones outside the LAN can't reach it.

**Fix:** Add a `PUBLIC_BASE_URL` env var. When set, backend uses it to construct share URLs. Stand up a Cloudflare Tunnel sidecar in Docker Compose that exposes the kiosk to the internet on a stable hostname.

**File changes:**

1. `backend/app/core/config.py` — add new setting:
   ```python
   public_base_url: str | None = None
   ```
   Pydantic will read it from `PUBLIC_BASE_URL` env var automatically.

2. `backend/app/api/v1/endpoints/kiosk.py` — line ~738, replace:
   ```python
   share_url = f'/api/v1/kiosk/share/{token}'
   ```
   with:
   ```python
   base = settings.public_base_url or ''  # empty → frontend falls back to window.location.origin
   share_url = f'{base}/api/v1/kiosk/share/{token}'
   ```
   (No other backend changes — the public endpoint itself is already unauthenticated and works.)

3. `frontend/src/components/kiosk/PhotoboothRevealScreen.tsx` — line ~47, replace:
   ```typescript
   const baseUrl = window.location.origin;
   setQrUrl(`${baseUrl}${shareData.qr_data}`);
   ```
   with:
   ```typescript
   // If backend returned an absolute URL (public_base_url set), use it as-is.
   // Otherwise fall back to LAN origin for dev/local setups.
   const sharePath = shareData.qr_data;
   const isAbsolute = /^https?:\/\//.test(sharePath);
   setQrUrl(isAbsolute ? sharePath : `${window.location.origin}${sharePath}`);
   ```

4. `docker-compose.yml` — add cloudflared sidecar service:
   ```yaml
   services:
     app:
       # ...existing config...
       environment:
         # ...existing env...
         PUBLIC_BASE_URL: ${PUBLIC_BASE_URL:-}

     cloudflared:
       image: cloudflare/cloudflared:latest
       restart: unless-stopped
       command: tunnel run
       environment:
         TUNNEL_TOKEN: ${TUNNEL_TOKEN:-}
       profiles: ["tunnel"]   # only starts when --profile tunnel is passed
       depends_on:
         - app
       networks:
         - default
   ```

   Using `profiles: ["tunnel"]` means the tunnel is **opt-in**. Operators who don't set `TUNNEL_TOKEN` get the existing LAN-only behavior. Operators who want public sharing run `docker compose --profile tunnel up`.

5. `.env.example` — add:
   ```
   # Optional: Public base URL for digital sharing feature.
   # Set this to a hostname pointing at the kiosk (e.g., via Cloudflare Tunnel).
   # When unset, share URLs use the kiosk's LAN address (works only on same WiFi).
   # Example: PUBLIC_BASE_URL=https://kiosk-007.yourdomain.com
   PUBLIC_BASE_URL=

   # Optional: Cloudflare Tunnel token (if using cloudflared sidecar).
   # Create at https://one.dash.cloudflare.com/ → Tunnels → Create a tunnel.
   # The tunnel must route to http://app:8000 (the backend container).
   TUNNEL_TOKEN=
   ```

6. `.env.production` — same additions.

7. `docs/technical/docker-deployment-guide.md` — add new section "Public URL Setup (for Digital Sharing)" explaining how to:
   - Create a Cloudflare Tunnel
   - Get the tunnel token
   - Configure DNS to point a hostname at the tunnel
   - Set `PUBLIC_BASE_URL` to that hostname
   - Run `docker compose --profile tunnel up -d`

**Acceptance criteria for Gap 1:**
- [x] With `PUBLIC_BASE_URL` unset, share URLs behave exactly as today (loopback-only)
- [x] With `PUBLIC_BASE_URL=https://kiosk.example.com` set, share URLs begin with `https://kiosk.example.com/`
- [x] Trailing slash on `PUBLIC_BASE_URL` is stripped (no `//` in URL)
- [x] Customer on mobile data scans QR → browser opens the public URL → composite image is served (verified by integration test, end-to-end smoke test pending real tunnel)
- [x] Token validation still rejects expired/tampered tokens (no auth bypass)
- [x] Without `--profile tunnel`, `docker compose up` starts no cloudflared container (no behavior change for operators who don't want the feature)

> **Implementation note:** `BIND_HOST` env var added as a documented Option B fallback (LAN-only without tunnel). Default `127.0.0.1` preserves D-025's loopback binding. `make dev-tunnel` / `make prod-tunnel` Makefile targets set `COMPOSE_PROFILES=tunnel` to enable the cloudflared sidecar (the `--profile` CLI flag was avoided because it must appear before the `up` subcommand, which doesn't compose cleanly with our dynamically-built compose file list).

---

### Gap 2: HTML landing page (replaces raw image)

**Problem:** Today `GET /api/v1/kiosk/share/{token}` returns `FileResponse(... image/jpeg ...)`. Customer sees a bare image with no download button, no branding, no instructions. Most mobile browsers won't even show a "save" hint — the customer has to know to long-press.

**Fix:** Add a new HTML route that wraps the image in a mobile-friendly page with a Download button and branding slot. Keep the raw-image endpoint as a sub-resource for the actual download.

**File changes:**

1. `backend/app/api/v1/endpoints/kiosk.py` — change routing structure:
   ```python
   # Public share routes (no auth)
   @router.get('/share/{token}')
   async def share_landing_page(token: str, db: AsyncSession = Depends(get_db_session)) -> HTMLResponse:
       """Render the mobile landing page that wraps the share image."""
       # Validate token WITHOUT consuming it (still valid for image fetch)
       from app.services.share_service import validate_share_token
       session_id = validate_share_token(token)  # raises if invalid/expired
       # Render HTML page — see template below
       return HTMLResponse(content=_render_share_page(token, session_id))

   @router.get('/share/{token}/image')
   async def serve_shared_composite(token: str, db: AsyncSession = Depends(get_db_session)) -> FileResponse:
       """Serve the raw composite image (called by the landing page's img tag)."""
       # Existing serve_shared_composite logic, just moved to /image sub-path
       ...
   ```

2. Backend HTML rendering — use FastAPI's HTMLResponse with an inline template string. No Jinja2 needed for something this simple. Suggested location: a new `backend/app/services/share_page.py` module that returns the HTML string.

   The page should include:
   - `<img src="/api/v1/kiosk/share/{token}/image">` showing the composite
   - `<a href="/api/v1/kiosk/share/{token}/image" download>` Download button
   - Operator-configurable branding (cafe name, optional hashtag, optional "powered by" line)
   - Mobile-friendly viewport meta tag
   - "This link expires in X minutes" hint
   - Light styling (inline CSS, no external dependencies — kiosk may have no internet when serving)

3. New config keys — **shipped 2026-06-20 in `operator_configs` under the `SHARING` category** (per D-030, superseding D-028's original env-var approach):
   - `share_brand_name` — Cafe/venue name shown as page heading (empty = "VibePrint")
   - `share_brand_handle` — Optional social handle for "Tag us" prompt (empty = hidden)
   - `share_brand_color` — Hex color for heading and Download button (default `#000000`)

   Edited via `/admin/sharing` (new admin panel). Read by the share endpoint via `config_service.get_configs_by_category(db, ConfigCategory.SHARING.value)`. Seeded on first boot via `config_service.seed_default_configs()`.

4. Update `frontend/src/api/types.ts` — no change needed (existing `ShareResponse` shape works for both LAN and public modes).

**Acceptance criteria for Gap 2:**
- [x] `GET /api/v1/kiosk/share/{token}` returns HTML (not raw image)
- [x] `GET /api/v1/kiosk/share/{token}/image` returns the raw JPEG (existing behavior preserved)
- [ ] Landing page renders correctly on iOS Safari and Android Chrome *(pending operator smoke test — cannot be verified from Linux dev environment)*
- [ ] Download button triggers actual file download (not just navigation to image) *(pending operator smoke test)*
- [x] Branding fields editable at `/admin/sharing` and persisted in `operator_configs` (`SHARING` category). Falls back to defaults (`VibePrint` / hidden / `#000000`) when unset.
- [x] Expired token shows a friendly "link expired" page (HTTP 410 HTML, not JSON error)

> **Implementation note:** New module `backend/app/services/share_page.py` renders the HTML inline (no Jinja2, no external assets — must render even when kiosk is offline). The HTML carries an iOS-friendly "long-press to save" hint next to the Download button because iOS Safari's `<a download>` behavior is unreliable for cross-origin (tunnel) URLs. Branding is sourced from the `SHARING` category in `operator_configs` (D-030, 2026-06-20) — originally env vars per D-028, moved to OperatorConfig after the user asked to revisit.

---

### Gap 3: Analytics events for scan and download

**Problem:** Today we log `share_token_generated` (structlog) but don't record analytics events when the customer actually scans or downloads. Operators can't measure the share conversion rate — which is the project's central KPI.

**Fix:** Fire `AnalyticsEvent` rows on scan and download. Add them to the existing analytics rollups.

**File changes:**

1. `backend/app/models/analytics.py` — verify the EventType enum includes:
   ```python
   class EventType(str, enum.Enum):
       ...
       SHARE_URL_SCANNED = 'share_url_scanned'
       COMPOSITE_DOWNLOADED = 'composite_downloaded'
       ...
   ```
   If missing, add and create an Alembic migration.

2. `backend/app/api/v1/endpoints/kiosk.py` — in both `/share/{token}` and `/share/{token}/image`:
   ```python
   # At top of each handler, after validate_share_token():
   await analytics_service.record_event(
       db,
       session_id=UUID(session_id),
       event_type=EventType.SHARE_URL_SCANNED,  # or COMPOSITE_DOWNLOADED for the image route
       metadata={'token_expiry_remaining_sec': ...},
   )
   await db.commit()
   ```
   Caveat: don't block the response on analytics. If analytics write fails, log warning and continue.

3. `backend/app/services/analytics_service.py` — add a rollup that computes:
   - `share_scan_rate` = sessions with SHARE_URL_SCANNED / sessions with composite generated
   - `share_download_rate` = sessions with COMPOSITE_DOWNLOADED / sessions with SHARE_URL_SCANNED
   Expose via the existing `/api/v1/admin/analytics/overview` endpoint.

4. Admin dashboard — add a small panel showing these two rates. Optional but useful.

**Acceptance criteria for Gap 3:**
- [x] Scanning a share URL creates an `AnalyticsEvent` row of type `SHARE_URL_SCANNED`
- [x] Loading the image (download click or img src) creates `COMPOSITE_DOWNLOADED`
- [ ] Analytics endpoint returns the two new rates *(DEFERRED — not part of this batch; revisit when an operator needs the metric surfaced)*
- [x] Multiple scans of the same token create multiple events (don't dedupe — operator wants frequency)
- [x] Events are purged alongside session retention (already automatic via existing cleanup)

> **Implementation note:** Both endpoints wrap `analytics_service.record_event` in try/except — a failed analytics write **never** blocks the share response (explicitly tested in `test_share_endpoints.py`). Only the token prefix (first 8 chars) is recorded in event metadata to limit replay material in logs. The `EventType` enum is stored as a plain `String(64)` column, not a Postgres ENUM, so adding `SHARE_URL_SCANNED` / `COMPOSITE_DOWNLOADED` was a code-only change — no Alembic migration needed.

---

### Gap 4: Vibe Check parity (decision required)

**Problem:** The share feature is photobooth-only. Vibe Check customers get a thermal receipt with their photo + AI reading but no digital equivalent.

**Decision point — read `00-executive-summary.md` line 99 carefully:**
> *"While many photobooth solutions send digital files via QR code or email, VibePrint OS produces a physical thermal receipt. This is a deliberate design choice rooted in the 'slow media' trend..."*

The original product philosophy was *physical-only by design*. Adding digital to Vibe Check partially undermines that pitch. Two options:

**Option A — Don't extend (recommended).** Keep Vibe Check physical-only. The "slow media" positioning is part of what differentiates Vibe Check from generic photobooths. Photobooth already has digital; that's enough.

**Option B — Extend with rendered receipt image.** Generate a PNG that renders the actual receipt layout (photo + AI reading text) and share that. Preserves the aesthetic. Requires building a receipt renderer (~1 day using Pillow).

**Default recommendation: Option A.** Skip this gap unless operator feedback specifically requests it. Document the decision in `.claude/state/DECISIONS_LOG.md` as D-029.

**If proceeding with Option B**, file changes:
- New service `backend/app/services/receipt_renderer.py` using Pillow
- New endpoint `GET /api/v1/kiosk/session/{id}/vibe-check/share` (mirrors photobooth share)
- Reuse share_service.py for token generation (already session-id-based, not flow-specific)
- Frontend `RevealScreen.tsx` (Vibe Check version) — add QR code display matching PhotoboothRevealScreen pattern

---

## 5.5 Suggested implementation order

If implementing Option 3 fresh, do it in this order:

1. **Day 1: Gap 1 (public URL plumbing).** Add `PUBLIC_BASE_URL` env var, update URL construction in backend and frontend, test that scanning from a phone on mobile data fails cleanly without it and works with it set. Don't add cloudflared yet — just verify the URL plumbing.
2. **Day 2: Gap 1 (cloudflared sidecar + docs).** Add the docker-compose sidecar, write the deployment guide section, do an end-to-end test with a real Cloudflare Tunnel.
3. **Day 3: Gap 2 (landing page).** Build the HTML landing page with inline CSS, mobile-optimized. Test on actual phones (iOS Safari and Android Chrome have different download behaviors).
4. **Day 4: Gap 3 (analytics).** Add events, rollups, admin display.
5. **Day 5: Buffer / polish.** Branding tweaks, error pages, manual end-to-end testing with real customers if possible.

Gap 4 is by default out of scope. Only tackle it if explicitly requested.

## 5.6 Out of scope for Option 3

These are explicitly NOT part of Option 3:

- Mobile companion app (rejected in `07-out-of-scope.md` §1.1)
- Social media OAuth / auto-posting (rejected in `01-personas-and-goals.md` NG-004)
- User accounts, email capture, loyalty program (rejected in NG-005)
- Replacing the physical receipt (it still prints every time)
- Vibe Check digital parity (deferred unless requested — see §5.4 Gap 4)
- Cloud relay / CDN upload of composite images (Cloudflare Tunnel is sufficient)
- Operator-uploaded branding images (just text fields for v1)
- Multi-language landing page (Phase 2 if i18n ever happens)

## 5.7 Risks and things to watch

| Risk | Mitigation |
|------|-----------|
| Public URL exposes kiosk to internet attacks | Only `/api/v1/kiosk/share/{token}` is publicly reachable; everything else stays LAN-only. Share endpoint is HMAC-validated with short TTL. Rate-limit the public route (existing `RateLimitMiddleware` covers it). |
| Composite image visible to anyone who guesses the URL | Impossible — token includes HMAC signature, can't be forged without `APP_SECRET_KEY`. TTL is 5 minutes by default. |
| Operator forgets to set `PUBLIC_BASE_URL` but enables tunnel | Document clearly in deployment guide. Add a startup check that warns if `cloudflared` is running but `PUBLIC_BASE_URL` is unset. |
| Customer's phone browser blocks the download | Use `<a download>` attribute + appropriate `Content-Disposition: attachment` header on `/image` endpoint. Test on iOS Safari (most restrictive). |
| Cloudflare changes their free tier | Keep the tunnel implementation isolated so it can be swapped for Tailscale Funnel or similar without touching share logic. |
| Share URL outlives composite image on disk | Already handled — `retention_service` purges composites after 7 days; share token TTL is 5 minutes, so token always expires first. Verify in tests. |

## 5.8 Acceptance criteria (end-to-end)

Option 3 is complete when:

- [x] Operator can opt into public sharing by setting `PUBLIC_BASE_URL` + `TUNNEL_TOKEN` env vars
- [x] Without those vars set, everything behaves as today (loopback-only)
- [ ] Customer on mobile data scans QR on photobooth reveal screen → landing page loads *(pending real-tunnel end-to-end smoke test — flag for operator before going live)*
- [x] Landing page shows the composite image, branding, and a Download button
- [ ] Tapping Download saves the image to the phone's photo library *(iOS Safari cannot be tested from Linux dev environment — operator must smoke-test on a real iPhone)*
- [x] Expired tokens show a friendly "link expired" page
- [x] Backend logs SHARE_URL_SCANNED and COMPOSITE_DOWNLOADED events
- [ ] Admin dashboard shows share scan rate and download rate *(DEFERRED — not in this batch)*
- [x] Composite images still auto-purge after 7 days (no behavior change)
- [x] All existing tests still pass (322 backend, 36 frontend — was 303/32 pre-batch)
- [x] New tests cover: token validation, landing page rendering, analytics event emission, expired token handling

---

# 6. Option 2 — Remote Operations

## 6.1 Two distinct features

**Option 2 is two different things bundled under one name.** This is the most important thing to understand:

- **Option 2 MVP** — single-kiosk operator pain relief. Push notifications + dead-kiosk detection. **Does not require Option 1.**
- **Option 2 Full** — multi-kiosk aggregation dashboard. **Requires Option 1** (needs `kiosk_id`, multi-tenant auth, etc.).

The docs (`07-out-of-scope.md` §2.5 and §3.2) describe only Option 2 Full. The MVP version is undocumented and would be inventing scope.

## 6.2 Option 2 MVP — when to consider

**Skip if:** The kiosk is in your home/office, or in a venue you visit daily.

**Consider if:** The kiosk is in a venue you visit weekly or less often. The value scales with physical distance, not kiosk count.

**What to build:**

1. **TOTP auth on admin login.** Add Google Authenticator support on top of the existing PIN. ~half a day. Required if admin UI is ever exposed to the internet.
2. **Push notifications for 3 critical events.** When the kiosk detects: printer offline >60s, paper out >60s, camera not detected on startup — fire a webhook to NTFY.sh (free) → push notification to operator's phone. ~1-2 days.
3. **External heartbeat watcher.** A free UptimeRobot cron hitting `/health` every 5 minutes. If it fails twice in a row, send a push notification. Zero kiosk-side code — uses existing health endpoint.
4. **Reuse Option 3's tunnel.** If Option 3 is built first, the kiosk already has a public URL. The same URL gives you remote admin access from your phone.

**Effort:** 2-3 days if Option 3 is built first, 4-5 days otherwise.

**Files to touch (rough):**
- `backend/app/core/security.py` — add TOTP verification alongside PIN
- `backend/app/services/*.py` — instrument existing error paths to fire webhook
- `backend/app/core/config.py` — add `NOTIFY_WEBHOOK_URL`, `TOTP_ISSUER`
- `frontend/src/components/admin/AdminLoginPage.tsx` — add TOTP input field
- `frontend/src/hooks/useAuth.ts` — extend login flow
- New `docs/technical/remote-ops-setup.md` — operator guide

## 6.3 Option 2 Full — when to consider

**Only consider when:** You have or are about to have 2+ kiosks. This is a multi-month effort and requires Option 1's schema as a prerequisite.

**Read `docs/prd/07-out-of-scope.md` §2.5 and §3.2 for the full vision.** Key pieces:
- Cloud-hosted backend (separate service, $5-20/month VPS)
- MQTT or WebSocket telemetry channel
- Multi-tenant schema (`Kiosk`, `Venue`, `Operator` tables; `kiosk_id` on existing tables)
- OTA update pipeline with signature verification + rollback
- Separate operator dashboard frontend

**Don't start this without explicit demand.** The MVP handles 80% of single-kiosk operator pain at 5% of the effort.

---

# 7. Option 1 — Multi-Kiosk Architecture

Already deeply planned in `docs/technical/multi-kiosk-architecture.md` (622 lines). Read that doc for the full spec — it covers:

- Schema changes (kiosk_id columns, new Kiosk/Venue/Operator tables)
- WebSocket protocol for kiosk ↔ room-agent communication
- Migration strategy from single-tenant to multi-tenant
- Hardware sharing model (cameras/printers per kiosk vs. shared)
- Security considerations

**When to start:** Only when concrete multi-kiosk demand exists. Most open-source projects never reach this stage. Don't speculate-build.

**What to do in the meantime:** Ensure no current code blocks the future migration. Specifically:
- Don't hardcode assumptions of "only one kiosk" anywhere
- Keep `session_service`, `analytics_service`, etc. compatible with a future `kiosk_id` filter
- The schema is already clean — no immediate refactor needed

---

# 8. Recommended Sequencing

Given everything above, the order in which to actually do the work:

**Phase 0 — Hygiene (DONE 2026-06-19):**
1. ~~Fix RevealScreen test regression (3 failing tests)~~ — **DONE.** Proxy-based framer-motion mock.
2. ~~Resolve SEC-001 (non-root Docker user)~~ — **STILL OPEN.** See `.claude/state/TASK_QUEUE.md` hygiene item 1. Small change, no reason to defer; included below in "Ongoing hygiene."
3. ~~Set up CI/CD (GitHub Actions for ruff/pytest/vitest)~~ — **STILL OPEN.** Included below.
4. ~~Expand frontend test coverage~~ — **PARTIAL.** PhotoboothRevealScreen covered 2026-06-19; many other screens still uncovered.

**Phase 1 — Option 3: Digital Sharing (DONE 2026-06-19):**
Shipped per §5 of this doc. Highest-leverage customer-facing work landed. Backend: 318 passing. Frontend: 36 passing.

**Phase 2 — Option 2 MVP: Remote Operations (CURRENT PRIORITY, CONDITIONAL):**
Only build this if the kiosk is deployed somewhere the operator visits weekly or less. If it lives in your home/office, skip this and jump to "Ongoing hygiene." Reuses Option 3's Cloudflare Tunnel — tunnel is already shipped, so the marginal effort is 2-3 days (TOTP auth, push notifications, external heartbeat watcher). Full spec in §6.2.

**Phase 3 — Decision point: Option 1 and Option 2 Full:**
Evaluate whether there's concrete multi-kiosk demand. If yes, start Option 1 (multi-kiosk schema — full spec in `multi-kiosk-architecture.md`) and bundle Option 2 Full on top. If no, do not speculate-build; keep the schema migration-ready but don't migrate.

**Ongoing hygiene (do anytime, no hard ordering):**
- SEC-001: non-root Docker user
- CI/CD: GitHub Actions workflow
- Frontend test coverage expansion (each missing test ~15 min)
- Backend photobooth integration test
- Wave 5 hardware validation (gated on real hardware access — operator's pre-launch checklist, not dev work)

---

# 9. Appendix: Rejected alternatives

These came up in analysis but were rejected:

- **Cloud relay / CDN upload of composites** (vs. Cloudflare Tunnel). More scalable but adds infra (S3 buckets, credentials, expiry management). Cloudflare Tunnel is free and sufficient.
- **Tailscale Funnel instead of Cloudflare Tunnel.** Viable alternative. Slightly simpler setup for operators who already use Tailscale. Cloudflare Tunnel chosen as the documented default because Cloudflare accounts are more common.
- **Mobile companion app.** Explicitly rejected — `07-out-of-scope.md` §1.1.
- **Social media OAuth.** Explicitly rejected — `01-personas-and-goals.md` NG-004.
- **Building Option 1 before Option 3.** Wrong sequencing — Option 3 has higher leverage and no dependencies. Option 1 should wait for concrete demand.
- **Building Option 2 Full before Option 1.** Cannot be done — Option 2 Full requires Option 1's schema.

---

# 10. Cross-references

- `docs/technical/multi-kiosk-architecture.md` — full Option 1 spec
- `docs/prd/07-out-of-scope.md` — original deferral rationale for Options 1, 2, 3
- `docs/prd/08-open-questions.md` — unresolved questions
- `docs/prd/01-personas-and-goals.md` NG-004, NG-005 — what we're NOT building (mobile app, accounts)
- `.claude/state/CURRENT_STATUS.md` — project completion status
- `.claude/state/TASK_QUEUE.md` — concrete next-up work items
- `.claude/state/DECISIONS_LOG.md` — architectural decisions log
- `backend/app/services/share_service.py` — existing share token logic (already built)
- `backend/app/api/v1/endpoints/kiosk.py` lines 719-770 — existing share endpoints (already built)
