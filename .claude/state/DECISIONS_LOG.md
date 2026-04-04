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
