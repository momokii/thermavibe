# Decisions Log — VibePrint OS

Record of key architectural and implementation decisions. Each entry documents what was decided, why, and what alternatives were rejected.

---

## D-001: FastAPI as Backend Framework

**Decision:** Use FastAPI (not Flask or Django) for the backend API.

**Rationale:**
- Native async/await support matching the async-first architecture requirement
- Built-in Pydantic integration for request/response validation
- Automatic OpenAPI documentation generation
- Modern Python type hint integration
- Lightweight — no ORM or template engine included by default

**Alternatives Rejected:**
- **Flask:** No native async support (requires Flask 2.0+ with async views, less integrated)
- **Django:** Too heavy for a kiosk API (ORM, admin, templates not needed); async support is bolted on
- **FastAPI vs others:** Best fit for async microservice with type safety

**Source:** `docs/technical/tech-stack-decision-record.md`

---

## D-002: SQLAlchemy 2.0 Async with asyncpg

**Decision:** Use SQLAlchemy 2.0 with async engine + asyncpg driver for all database operations.

**Rationale:**
- Async-first matches the overall architecture
- SQLAlchemy 2.0 has native async support via `AsyncSession`
- asyncpg is the fastest PostgreSQL driver for Python
- PostgreSQL-specific features (JSONB, partial indexes) available
- No SQLite support needed or wanted

**Alternatives Rejected:**
- **Tortoise ORM:** Less mature, smaller ecosystem
- **SQLAlchemy sync:** Violates async-first rule
- **Raw SQL with asyncpg:** No ORM benefits, migration management harder

**Source:** `docs/technical/tech-stack-decision-record.md`, `CLAUDE.md`

---

## D-003: Provider-Agnostic AI and Payment Design (Strategy Pattern)

**Decision:** Use the Strategy pattern for both AI providers and payment gateways. A facade service dispatches to the configured provider. Mock providers are always available.

**Rationale:**
- Operators must be able to switch providers without code changes
- Mock providers are essential for development and testing
- No vendor lock-in — any provider can be added by implementing the interface
- Configuration-driven selection via OperatorConfig

**Alternatives Rejected:**
- **Hardcoded single provider:** Violates scope discipline (provider-agnostic requirement)
- **Plugin architecture:** Over-engineered for the number of providers needed

**Source:** `docs/prd/02-functional-requirements.md`, `docs/technical/architecture-overview.md`

---

## D-004: React 19 + Vite 6 for Frontend

**Decision:** Use React 19 with Vite 6 as the frontend framework and build tool.

**Rationale:**
- React 19 is the latest stable version with improved performance
- Vite 6 provides fast HMR and optimized builds
- Large ecosystem for UI components (shadcn/ui)
- TypeScript 5 strict mode fully supported

**Alternatives Rejected:**
- **Next.js:** SSR not needed for a kiosk application; adds complexity
- **Vue/Svelte:** Smaller ecosystems; less familiarity with shadcn/ui

**Source:** `docs/technical/tech-stack-decision-record.md`

---

## D-005: Zustand for Client State + React Query for Server State

**Decision:** Use Zustand for client-side state management and @tanstack/react-query for server state.

**Rationale:**
- Clear separation of concerns: UI state vs API data
- Zustand is lightweight, no boilerplate, excellent for the kiosk state machine
- React Query handles caching, background refetch, and loading states automatically
- Avoids Redux complexity for a relatively simple state shape

**Alternatives Rejected:**
- **Redux Toolkit:** Overkill for this application's state complexity
- **Context API only:** Performance issues with frequent state updates (camera preview, countdown)
- **JotAI:** Less mature ecosystem

**Source:** `frontend/package.json`, `docs/technical/architecture-overview.md`

---

## D-006: Docker-Only Deployment

**Decision:** The system is deployable exclusively via Docker Compose. No bare-metal installation supported.

**Rationale:**
- Simplifies deployment for non-technical operators (Budi persona)
- Reproducible environment across all machines
- No "works on my machine" issues
- Matches NFR-MAINT-001 requirement

**Alternatives Rejected:**
- **Bare-metal Python:** Dependency hell, environment drift, harder to support
- **Kubernetes:** Overkill for single-kiosk deployment

**Source:** `docs/prd/03-nonfunctional-requirements.md` (NFR-MAINT-001)

---

## D-007: PIN-Based Admin Authentication

**Decision:** Admin dashboard protected by a 4-8 digit PIN with rate limiting. No username required. No user accounts for end-users.

**Rationale:**
- Simple for non-technical operators (Budi persona)
- Kiosk is on a local network — PIN is sufficient security
- No need for complex auth for a single-operator system
- Rate limiting prevents brute-force (lockout: 5min, 10min, 20min, doubling)

**Alternatives Rejected:**
- **Username + password:** Unnecessary complexity for a single-operator kiosk
- **OAuth/Social login:** No internet dependency for admin access
- **No auth at all:** Would allow anyone on the local network to change settings

**Source:** `docs/prd/02-functional-requirements.md`, `docs/prd/03-nonfunctional-requirements.md` (NFR-SEC-002)

---

## D-008: Privacy-First Design (No Persistent Photo Storage)

**Decision:** User photos are never stored in the database, never persist beyond the active session, and are deleted during RESET state. Photos are captured to `/tmp/sessions/{id}/` and deleted after printing.

**Rationale:**
- Privacy is a primary concern (users in public spaces)
- Legal compliance with Indonesia's PDP Law
- Builds user trust — no hidden data collection
- Matches NFR-SEC-001, NFR-SEC-004 requirements

**Alternatives Rejected:**
- **Cloud storage:** Privacy risk, cost, unnecessary complexity
- **Database BLOB storage:** Performance impact, privacy risk
- **Indefinite disk storage:** Privacy violation, disk space growth

**Source:** `docs/prd/05-data-models.md` (Section 6: Privacy Model)

---

## D-009: Payment Toggle-able, Default OFF

**Decision:** Payment is controlled by `payment.enabled` in OperatorConfig. Default is `false` (free mode). Operators can switch without redeployment.

**Rationale:**
- Operators need flexibility (free mode to drive traffic, paid mode for revenue)
- Budi persona uncertain about pricing — needs to experiment
- Zero-downtime toggle matches OG-004 goal

**Alternatives Rejected:**
- **Always paid:** Some operators want free mode for marketing
- **Always free:** Lost revenue opportunity for operators
- **Code change required to switch:** Violates OG-004 (zero downtime toggle)

**Source:** `docs/prd/01-personas-and-goals.md` (OG-004), `docs/prd/02-functional-requirements.md`

---

## D-010: Single Session at a Time

**Decision:** The system supports exactly one active session. Concurrent session attempts are rejected.

**Rationale:**
- Single camera, single printer — hardware constraint
- Simplifies state management (no concurrency issues)
- Matches NFR-PERF-005 requirement
- Architecture is instance-scoped for future multi-kiosk support

**Alternatives Rejected:**
- **Queue-based sessions:** Users won't wait in line at a kiosk
- **Concurrent sessions:** Hardware cannot support it

**Source:** `docs/prd/03-nonfunctional-requirements.md` (NFR-PERF-005)

---

## D-011: MJPEG for Camera Preview Stream

**Decision:** Use MJPEG (Motion JPEG) for the live camera preview on the kiosk screen during CAPTURE state.

**Rationale:**
- Lower CPU usage vs H.264/H.265 decoding
- Lower latency (no inter-frame dependencies)
- Broad webcam and browser support
- Sufficient quality for a countdown preview
- Target: <200ms latency (NFR-PERF-003)

**Alternatives Rejected:**
- **WebRTC:** Over-engineered for local single-camera use case
- **H.264 stream:** Higher CPU, decoding latency, complexity
- **WebSocket with raw frames:** Reinventing MJPEG

**Source:** `docs/prd/06-integration-map.md` (Section 4.3)

---

## D-012: Floyd-Steinberg Dithering for Thermal Printing

**Decision:** Use Floyd-Steinberg error-diffusion dithering to convert photos to 1-bit bitmaps for thermal printing.

**Rationale:**
- Produces much higher quality results than simple thresholding
- Standard algorithm with well-known properties
- Produces the distinctive "dithered halftone" aesthetic that makes receipts shareable
- Well-suited for the small print area (384px or 576px wide)

**Alternatives Rejected:**
- **Simple thresholding:** Poor quality, visible banding
- **Ordered dithering:** Less natural-looking results
- **Atkinson dithering:** Good but less standard

**Source:** `docs/prd/06-integration-map.md` (Section 3.4)

---

## D-013: Tailwind CSS 4 + shadcn/ui for Frontend Styling

**Decision:** Use Tailwind CSS 4 for utility-first styling with shadcn/ui for accessible, composable UI primitives.

**Rationale:**
- Tailwind CSS 4 is the latest version with improved performance
- shadcn/ui provides accessible, unstyled components that integrate with Tailwind
- Copy-paste component model — components live in the repo, not a dependency
- Kiosk UI needs large touch targets, custom theming — Tailwind excels here

**Alternatives Rejected:**
- **Styled-components/Emotion:** Runtime CSS-in-JS performance overhead
- **Material UI:** Opinionated design doesn't match kiosk aesthetic
- **Headless UI:** Less comprehensive than shadcn/ui for form components

**Source:** `docs/technical/tech-stack-decision-record.md`

---

## D-014: PostgreSQL-Only (No SQLite Support)

**Decision:** Use PostgreSQL exclusively. The system must NOT function with SQLite.

**Rationale:**
- PostgreSQL provides JSONB, partial indexes, full-text search needed for analytics
- Single-writer SQLite limitation unsuitable even for single kiosk
- Prevents accidental production use of SQLite
- Matches NFR-SCALE-002 requirement

**Alternatives Rejected:**
- **SQLite compatible:** Performance limitations, missing features
- **MySQL:** Less feature-rich for JSON and indexing needs

**Source:** `docs/prd/03-nonfunctional-requirements.md` (NFR-SCALE-002)

---

## D-015: Dual Kiosk Flows — Vibe Check + Photobooth

**Decision:** The kiosk supports two distinct session types via a single state machine: the original **Vibe Check** flow (single photo + AI reading) and a new **Photobooth** flow (multi-photo strip with frame selection, arrangement, and composite printing). A `SessionType` discriminator (`vibe_check` / `photobooth`) was added to `KioskSession`.

**Rationale:**
- Photobooth strips are a different value proposition than AI readings — operators wanted both
- Sharing the IDLE/PAYMENT/CAPTURE/RESET states avoids duplication
- A `FeatureSelectScreen` at session start lets the user (or an access code) choose the flow
- New states `FRAME_SELECT`, `ARRANGE`, `COMPOSITING`, `PHOTOBOOTH_REVEAL` are scoped to the photobooth flow and unreachable from Vibe Check

**Alternatives Rejected:**
- **Separate kiosk apps per flow:** Doubles deployment burden, contradicts single-kiosk NFR
- **Single flow with a "mode" flag inside states:** State explosion; harder to reason about transitions

**Source:** `backend/app/models/session.py` (`KioskState`, `SessionType`), `backend/app/services/photobooth_service.py`

---

## D-016: Access Codes as Payment Alternative

**Decision:** Operators can mint redeemable codes (`AccessCode` model) that grant kiosk access without payment. Codes have a type (`vibe_check` / `photobooth` / `universal`), a `max_uses`, an optional `expires_at`, and an optional `price` that is copied to `session.payment_amount` on redemption.

**Rationale:**
- Event organizers (conferences, weddings, brand activations) want to underwrite prints for guests without running QRIS per session
- Per-code use tracking enables "X prints per ticket" offers
- Storing `price` on the code lets operators charge a notional amount (for analytics/revenue) even when the guest doesn't pay
- The `access_code_id` FK on `KioskSession` is `SET NULL` on delete so historical sessions survive code revocation

**Alternatives Rejected:**
- **Free-mode toggle only:** Too coarse — operators want per-event control
- **Discount codes on the payment flow:** Adds complexity; many events don't want any payment UI at all

**Source:** `backend/app/models/access_code.py`, `backend/app/services/access_code_service.py`, migration `7bf4bbccb2f1_add_access_codes_table.py`

---

## D-017: Photobooth Themes Stored as JSONB Config

**Decision:** Photobooth themes are stored as a `photobooth_themes` table row with a `config: JSONB` field holding background/border/decoration/font/watermark styling. Built-in themes are seeded on first startup (`is_builtin=true`, immutable); admins can create custom themes.

**Rationale:**
- Themes are inherently nested/recursive (colors, fonts, decoration positions) — JSONB fits naturally
- New visual knobs can be added without schema migrations
- Only one theme can be `is_default=true` at a time; enforced at the service layer (`theme_service.set_default`)
- A `preview_image_path` allows the admin UI to render a thumbnail without regenerating the composite

**Alternatives Rejected:**
- **One column per styling property:** Proliferates migrations; rigid
- **External YAML/TOML files:** No admin UI; harder to audit
- **Templates directory with code:** Operators cannot edit through the admin panel

**Source:** `backend/app/models/photobooth_theme.py`, `backend/app/services/theme_service.py`, migration `a3f7c2e1b8d4_add_photobooth_support.py`

---

## D-018: Floyd-Steinberg Dithering + PIL Composite for Strips

**Decision:** Photobooth composites are generated server-side with Pillow. The image composition service lays out the captured photos into the selected grid (e.g. 4 rows × 1 column), applies the theme background/borders/watermark, and the existing Floyd-Steinberg dithering utility converts the result to 1-bit for ESC/POS raster printing.

**Rationale:**
- Reuses the existing dithering + ESC/POS raster pipeline (D-012) — no parallel code path
- Server-side composition means the printer receives a deterministic byte stream regardless of kiosk browser
- Pillow is already a dependency for AI image preprocessing
- Composites are persisted to `/tmp/vibeprint/...` and surfaced via the share service with a TTL

**Alternatives Rejected:**
- **Client-side canvas rendering:** Browser canvas DPI and font rendering vary; harder to match print output
- **Per-provider print templates:** Vendor lock-in, violates provider-agnostic principle

**Source:** `backend/app/services/image_composition_service.py`, `backend/app/utils/dithering.py`, `backend/app/utils/escpos.py`

---

## D-019: Composite Retention with TTL Sweep

**Decision:** Generated photobooth composites are written to a named Docker volume (`app-composites` → `/tmp/vibeprint`) and a retention service expires them after `photobooth_composite_retention_hours` (default 168h = 7 days). The share URL has a separate, shorter TTL (`photobooth_share_url_ttl_seconds`, default 300s).

**Rationale:**
- Composites are needed briefly for share URLs and reprint-from-gallery, but privacy law (PDP) and disk hygiene require eventual deletion
- Decoupling share-URL TTL from on-disk retention lets the share link die before the file is purged (no 404s mid-share)
- A `cleared_at` partial index on `kiosk_sessions` supports the sweep without a full table scan

**Alternatives Rejected:**
- **Delete immediately after print:** Breaks share-from-gallery and reprint flows
- **Indefinite retention:** Privacy violation, disk growth
- **Database BLOB storage:** Performance and backup cost

**Source:** `backend/app/services/retention_service.py`, `backend/app/services/share_service.py`, `docker-compose.yml` (`app-composites` volume)

---

## D-020: Payment Screen Polls via createQR + Status Polling

**Decision:** The kiosk `PaymentScreen` calls `POST /api/v1/payment/qr` on mount to create a QR, then polls `GET /api/v1/payment/{session_id}/status` every 3 seconds until the status is `confirmed` or `expired`, with a 120s countdown sourced from `payment_timeout_seconds`.

**Rationale:**
- QRIS (Midtrans/Xendit) webhooks are inbound-only — the kiosk cannot accept callbacks
- Polling is simple, works through NAT, and 3s is fast enough for a 120s payment window without hammering the gateway
- The countdown is driven client-side from the same `payment_timeout_seconds` config the backend uses, so the two stay in sync
- On expiry the screen transitions to a recovery state; on confirmation it advances to CAPTURE

**Alternatives Rejected:**
- **WebSocket push:** Adds infra; the gateway already polls via webhook
- **Server-Sent Events:** Same complexity cost as WebSocket for a single one-shot transition

**Source:** `frontend/src/components/kiosk/PaymentScreen.tsx`, `frontend/src/api/paymentApi.ts`, `backend/app/api/v1/endpoints/payment.py`

---

## D-021: Astro for the Marketing Website (Not the Kiosk App)

**Decision:** A separate `website/` directory ships a static marketing site built with Astro + Tailwind, deployed via its own Docker compose + nginx. It is **not** part of the kiosk or admin React app.

**Rationale:**
- Marketing pages (gallery, docs, CTA) are content-heavy and benefit from SSG
- Astro ships zero JS by default — fast LCP, no React runtime tax
- Keeping it separate from the kiosk SPA means marketing deploys never touch the running kiosk
- Docs in the website mirror `docs/` but are reconciled against actual code in commits like "fix(website): reconcile all docs pages with actual codebase"

**Alternatives Rejected:**
- **Fold marketing into the React SPA:** Heavier bundle, slower LCP, couples release cadence
- **Next.js:** Overkill for a static marketing site

**Source:** `website/` (Astro + Tailwind), `website/docker-compose.yml`, `website/nginx.conf`

---

## D-022: WSL2 Hardware Passthrough via usbipd-win Auto-Install

**Decision:** `scripts/start-docker.sh` detects WSL2 (`uname -r` matches `microsoft|wsl`) and, when USB devices are expected but missing, auto-installs `usbipd-win` on the Windows host (via `winget`), binds the device on Windows, then attaches it to the WSL VM using the v5 `usbipd attach` syntax (the `wsl` subcommand was removed in v5).

**Rationale:**
- The reference dev machine is WSL2 — hardware must reach the container for real-camera/real-printer testing
- Earlier attempts called `usbipd wsl attach`, which silently failed on v5; the script now binds explicitly then attaches
- Auto-installing usbipd-win removes a per-machine setup step that was a frequent onboarding blocker
- The script is defensive: `set -e` no longer kills the run when PowerShell calls fail, the Windows PATH is refreshed after install, and camera accessibility is verified before container start (group `video` is added when cameras are detected)

**Alternatives Rejected:**
- **Document-only (manual setup):** Tried first; recurring breakage on usbipd version bumps
- **Skip WSL2 support:** Would block the primary dev environment

**Source:** `scripts/start-docker.sh`, commits `3da2643` through `d864865` (May 13–15)

---

## D-023: Progressive Retry for USB-to-Parallel Bridge Chips

**Decision:** The printer service uses a progressive retry strategy with increasing waits for USB-to-parallel bridge chips (e.g. the `0fe6` bridge). The initial connection attempt waits up to 15 seconds to absorb power-cycle recovery, and subsequent reconnects back off progressively. `is_online()` status queries are never used for bridge chips (they don't implement ESC/POS status correctly); sysfs presence checks are used instead.

**Rationale:**
- Bridge-chip printers report offline even when mechanically fine — `is_online()` returns false negatives
- Power-cycling the printer (common at events) makes the device briefly unavailable to the host; a single quick retry fails
- Empirically, a 15s initial wait recovers ~all power-cycle cases without blocking normal operation
- sysfs (`/sys/bus/usb/devices/...`) is the ground truth for "is the device enumerated"

**Alternatives Rejected:**
- **Simple retry with fixed 1s wait:** Power-cycle case fails (commit `ff867be` reverted this)
- **Strict ESC/POS communication test on connect:** Rejects healthy bridge-chip printers (commit `dd57616` removed this)

**Source:** `backend/app/services/printer_service.py`, commits `bbeb061` through `7b19dcf` (May 9), `feedback_printer_usb_bridge.md` memory

---

## D-024: Global Rate Limit + Request Size Limit Middleware

**Decision:** Phase 1 security findings SEC-002, SEC-003, and SEC-004 were resolved by adding `RateLimitMiddleware` (global, not just admin login), `RequestSizeLimitMiddleware`, and narrowing CORS to methods `GET/POST/PUT` and headers `Content-Type/Authorization/X-Request-ID`.

**Rationale:**
- The original audit only rate-limited the admin login endpoint; a public kiosk needs blanket protection against abusive traffic
- Request size limits block oversized payloads (and accidental image dumps) at the edge
- CORS method/header narrowing reduces the attack surface without breaking the kiosk SPA (which only uses those three methods and three headers)

**Alternatives Rejected:**
- **Per-route rate limiting:** Higher maintenance, easy to forget on new endpoints
- **Redis-backed limiter now:** Premature for single-kiosk; in-memory limiter is sufficient until multi-kiosk

**Source:** `backend/app/core/middleware.py` (`RateLimitMiddleware`, `RequestSizeLimitMiddleware`, `setup_cors`), `backend/app/main.py`

---

## D-025: Production SPA Serving from FastAPI

**Decision:** In production, the Dockerfile multi-stage build copies `frontend/dist` into `/app/static` inside the backend image, and FastAPI serves the SPA via a catch-all `/{full_path:path}` route registered **after** `/api/v1/*`, `/health`, and `/docs`. In development, this path is inert (no `static/` dir) and the Vite dev server handles the frontend on port 5173.

**Rationale:**
- Single-container deployment simplifies the production docker-compose (one image, one port)
- Registering the catch-all last means API routes match first — no shadowing
- Health check (`/health`) is independent of the SPA, so container orchestrators get a real signal
- Port binding is `127.0.0.1` only — the kiosk browser connects locally, no external exposure

**Alternatives Rejected:**
- **Separate nginx container for the SPA:** More moving parts; the backend can serve static files fine
- **CDN-hosted SPA:** Kiosk is offline-first; CDN adds a failure mode

**Source:** `backend/app/main.py` (SPA fallback block), `Dockerfile`, commit `08f8382`

---

## D-026: Cloudflare Tunnel as Opt-In Sidecar via Compose Profiles

**Decision (2026-06-19):** Digital sharing (Option 3 Gaps 1-3) ships with Cloudflare Tunnel as the default public-URL mechanism, exposed as an opt-in Docker Compose sidecar under `profiles: ["tunnel"]`. The default `make dev` / `make prod` commands start no cloudflared container; operators must explicitly run `make dev-tunnel` or `make prod-tunnel` (which add `--profile tunnel`) to enable it.

**Rationale:**
- Strict opt-in preserves D-025's loopback-binding default for all operators who don't want the feature
- The tunnel is outbound-only — no inbound port opened on the kiosk, no router/NAT configuration needed
- Failure isolation: cloudflared runs as a separate service; a bad token or network failure logs errors and restarts but cannot break the app (the app has no `depends_on: cloudflared`)
- Operator's DNS is already at Cloudflare (DNS migrated from Hostinger), so tunnel creation is a one-click DNS setup
- Reusable infrastructure: the same tunnel can later serve Option 2 (Remote Operations MVP) without rebuild

**Alternatives Rejected:**
- **Tailscale Funnel:** Viable, but Cloudflare accounts are more common and the operator already has one. Documented in update-roadmap.md §9.
- **BIND_HOST=0.0.0.0 by default with reverse proxy:** Would weaken D-025 and expose admin PIN brute-force surface to the LAN. Kept as a documented Option B fallback for offline events only.
- **Cloud relay / CDN upload of composites:** More infra (S3, credentials, expiry management) for no incremental benefit over the tunnel.
- **Make tunnel the default (always-on):** Would silently fail for operators who don't have a Cloudflare account. Opt-in is safer.

**Source:** `docker-compose.yml` (cloudflared service), `Makefile` (`dev-tunnel` / `prod-tunnel`), commit (digital sharing batch)

---

## D-027: BIND_HOST Env Var for LAN-Only Fallback (Option B)

**Decision (2026-06-19):** Docker Compose port binding is now `"${BIND_HOST:-127.0.0.1}:${APP_PORT:-8000}:8000"` in both `docker-compose.yml` and `docker-compose.dev.yml`. Default `127.0.0.1` preserves D-025's loopback binding. Operators who want LAN-only access (no tunnel, offline events) can set `BIND_HOST=0.0.0.0`.

**Rationale:**
- Preserves the secure default for the 95% case (tunnel-based deployment)
- Gives operators an escape hatch for venues with no internet (conferences, remote locations)
- Documents the security tradeoff explicitly: `0.0.0.0` exposes `/admin` to the LAN, where the 4-digit PIN is the only barrier

**Alternatives Rejected:**
- **Hardcode `0.0.0.0` and rely on firewall rules:** Operators would have to manage host firewall rules — too easy to misconfigure. Env var is explicit and visible in `docker compose ps`.
- **Two compose files (with/without LAN exposure):** Profile-based switching is cleaner than file-based switching for this single toggle.

**Source:** `docker-compose.yml`, `docker-compose.dev.yml`, `.env.example`, `.env.production`, `docs/technical/docker-deployment-guide.md` §2.5

---

## D-028: Share Branding via Env Vars (OperatorConfig Category Deferred)

**Decision (2026-06-19):** Landing-page branding (`SHARE_BRAND_NAME`, `SHARE_BRAND_HANDLE`, `SHARE_BRAND_COLOR`) ships as env vars read by Pydantic `Settings`. OperatorConfig category `sharing` deferred to a future iteration.

**Rationale:**
- Three string fields don't justify the OperatorConfig schema migration + admin UI + form validation work right now
- Branding rarely changes (set once at venue setup) — no real ergonomic loss vs admin panel
- Ships faster, can be migrated to OperatorConfig later without breaking the env-var path (Pydantic settings can fall back to env if the OperatorConfig value is unset)

**Alternatives Rejected:**
- **OperatorConfig category `sharing` immediately:** Correct long-term, but premature for three string fields. Will revisit if/when more sharing-related settings appear (e.g. custom CSS, multiple brand presets per venue).

**Source:** `backend/app/core/config.py` (Digital Sharing section), `backend/app/services/share_page.py`, `.env.example`, `.env.production`

---

## D-029: Vibe Check Share Parity Default-Skip

**Decision (2026-06-19):** Gap 4 from update-roadmap.md §5.4 (Vibe Check digital sharing parity) is DEFAULT-SKIP for the initial Digital Sharing batch. Only the Photobooth flow gets share URLs. The Vibe Check flow remains physical-receipt-only.

**Rationale:**
- `docs/prd/00-executive-summary.md` line 99 frames Vibe Check's physical-only receipt as a deliberate "slow media" design choice. Adding digital undermines that positioning.
- Photobooth customers are the explicit target for the project's "20% of receipts photographed and shared" KPI (`00-executive-summary.md` line 77).
- Building a Vibe Check share would require rendering a receipt-mimicking PNG (Pillow work, ~1 day) — out of scope for this batch.

**Revisit trigger:** concrete operator feedback requesting Vibe Check digital downloads, or analytics showing photobooth scan rates high enough to justify extending the flow.

**Alternatives Rejected:**
- **Ship both now:** Premature; not requested and weakens the slow-media pitch.
- **Never:** Too strong — should remain data-driven, not dogmatic.

**Source:** `docs/technical/update-roadmap.md` §5.4 Gap 4, this batch's TASK_QUEUE deferral entry
