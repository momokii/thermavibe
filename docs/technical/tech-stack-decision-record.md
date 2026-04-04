# VibePrint OS -- Technology Stack Decision Records

> This document captures Architecture Decision Records (ADRs) for every major technology choice in VibePrint OS. Each ADR follows the standard format of Context, Decision, and Consequences, and includes a section on Alternatives Considered.

---

## ADR-001: Python / FastAPI for Backend

**Status:** Accepted
**Date:** 2025-01-15
**Decision Maker:** Core Team

### Context

VibePrint OS requires a backend capable of handling REST API requests, communicating with external AI providers over HTTPS, integrating with payment gateways via webhooks, driving USB thermal printers through ESC/POS, and capturing frames from USB webcams via OpenCV/V4L2. The backend must be asynchronous to avoid blocking during I/O-heavy operations (printer communication, AI API calls, image processing). The project targets a single-machine deployment running on Linux Ubuntu/Debian, but the codebase should be maintainable by a broad developer community given its open-source nature.

### Decision

Use **Python 3.12+** with **FastAPI** as the backend framework. FastAPI provides native async support, automatic OpenAPI documentation, Pydantic-based request validation, and dependency injection. Python's ecosystem offers mature libraries for every hardware integration the project needs: `python-escpos` for thermal printers, `opencv-python` for camera access, and `httpx` for async HTTP clients to AI and payment providers.

### Consequences

**Positive:**
- Native async/await support in Python 3.12+ aligns with FastAPI's async request handlers, eliminating thread pool overhead for I/O-bound operations.
- `python-escpos` is the most mature Python library for ESC/POS thermal printer communication, with support for image printing, barcode generation, and paper cutting.
- OpenCV with V4L2 backend provides reliable USB webcam access on Linux, including MJPEG stream extraction.
- Pydantic v2 integration in FastAPI gives strict type validation on all API inputs and outputs without additional boilerplate.
- Broad developer familiarity with Python lowers the barrier to contribution for an open-source project.
- FastAPI's built-in OpenAPI/Swagger documentation at `/docs` accelerates frontend-backend integration and third-party extensibility.

**Negative:**
- Python's Global Interpreter Lock (GIL) means CPU-bound image processing (dithering, resizing) may benefit from offloading to a separate process or using libraries with C extensions (NumPy, Pillow).
- Python's runtime performance is lower than compiled languages like Go or Rust, though this is not a bottleneck for the expected load (single kiosk, low concurrency).
- Dependency management requires careful handling of system-level libraries (libusb for `python-escpos`, libGL for OpenCV) in the Docker image.

### Alternatives Considered

| Alternative | Why Rejected |
|---|---|
| **Node.js / Express** | Adequate async support, but `node-escpos` and USB webcam libraries are less mature than their Python counterparts. TypeScript adds type safety but still lacks Pydantic's runtime validation without additional libraries. |
| **Go** | Excellent performance and concurrency model, but limited library ecosystem for thermal printer communication and no equivalent to OpenCV's mature Python bindings. The development velocity advantage of Python's ecosystem outweighs Go's performance benefits for this use case. |
| **Rust** | Superior memory safety and performance, but significantly higher development complexity. The hardware integration libraries (`escpos-rs`, image processing) are less mature. Developer onboarding cost is too high for an open-source project targeting broad contribution. |

---

## ADR-002: React + Vite + TypeScript for Frontend

**Status:** Accepted
**Date:** 2025-01-15
**Decision Maker:** Core Team

### Context

The kiosk UI is a single-page application that runs inside Chromium's `--kiosk` mode on the host machine. It must display a live camera MJPEG stream, handle animated state transitions between kiosk screens, present QRIS payment QR codes, and show AI-generated results with print options. The same React application also serves an admin dashboard at `/admin` for operators to configure the kiosk, view analytics, and test hardware. The frontend must be lightweight enough to load quickly on commodity hardware, support touch interactions, and render smooth animations.

### Decision

Use **React 19** with **TypeScript 5**, bundled by **Vite 6**, styled with **Tailwind CSS 4** and **shadcn/ui** components, with animations powered by **Framer Motion** and state management via **Zustand**.

This combination provides type-safe component development, fast HMR during development, a utility-first CSS approach that keeps bundle sizes small, accessible base components through shadcn/ui's copy-paste pattern, and a lightweight state management solution that avoids the boilerplate of Redux.

### Consequences

**Positive:**
- React 19's concurrent features and automatic batching improve render performance for the kiosk's animated transitions.
- TypeScript 5 strict mode catches type errors at compile time, reducing runtime bugs in the kiosk flow where error recovery is limited.
- Vite 6 provides sub-second HMR during development, significantly improving developer experience compared to Webpack-based setups.
- Tailwind CSS 4 eliminates unused CSS from production builds, keeping the kiosk UI bundle small for fast load times.
- shadcn/ui components are copied into the project (not installed as a dependency), giving full control over styling and behavior while maintaining accessibility.
- Zustand's minimal API surface keeps the kiosk state machine simple and predictable.
- Framer Motion's declarative animation API makes it straightforward to implement polished screen transitions without managing animation state manually.
- React Query handles server state (session data, payment status polling) with automatic caching, background refetching, and stale-while-revalidate patterns.

**Negative:**
- React requires a client-side JavaScript runtime, which means the kiosk UI depends on a browser engine (Chromium) being available on the host.
- The combination of React + TypeScript + Tailwind + shadcn/ui + Framer Motion + Zustand introduces a large surface area of dependencies that must be kept in sync.
- shadcn/ui's copy-paste pattern means component updates require manual merging when upstream changes are desired.
- React's component model can lead to unnecessary re-renders if not carefully managed, though React Query and Zustand mitigate this with their built-in optimization.

### Alternatives Considered

| Alternative | Why Rejected |
|---|---|
| **Next.js** | Next.js adds server-side rendering, routing conventions, and an opinionated project structure that are unnecessary for a single-page kiosk application running in Chromium. The server-side rendering overhead provides no benefit when the app is served from localhost. |
| **Vue / Nuxt** | Vue offers similar capabilities, but React has a larger ecosystem of animation libraries (Framer Motion), UI component libraries (shadcn/ui), and community resources. The team's collective experience favors React. |
| **Svelte** | Svelte produces smaller bundles and has simpler reactivity, but its ecosystem lacks a component library comparable to shadcn/ui and its animation story is less mature than Framer Motion. |
| **Electron** | Electron bundles a Chromium runtime, adding significant memory overhead (~100-200 MB) for no benefit when the host already runs Chromium in kiosk mode. Serving a static SPA from the FastAPI backend is simpler and lighter. |

---

## ADR-003: PostgreSQL over SQLite

**Status:** Accepted
**Date:** 2025-01-15
**Decision Maker:** Core Team

### Context

VibePrint OS needs a database to persist session records, configuration, payment transactions, and analytics data. While a single kiosk has low write throughput, the project must be ready for multi-kiosk deployments where multiple instances write to a shared database. The database must support concurrent writes, robust transaction isolation, and migrations managed through Alembic.

### Decision

Use **PostgreSQL 16** as the sole database, running in a Docker container alongside the application. Async SQLAlchemy 2.0 serves as the ORM, and Alembic manages schema migrations.

### Consequences

**Positive:**
- PostgreSQL handles concurrent writes from multiple kiosks without the write-locking limitations of SQLite.
- Row-level locking and MVCC (Multi-Version Concurrency Control) ensure transaction isolation without performance degradation.
- PostgreSQL's JSONB column type supports flexible configuration storage where schema evolution is expected.
- Alembic provides versioned migrations with automatic generation from SQLAlchemy model changes, supporting safe schema evolution.
- Running PostgreSQL in Docker ensures consistent behavior across development and production environments.
- PostgreSQL's tooling ecosystem (pg_dump, pg_restore, WAL archiving) supports reliable backup and recovery procedures.

**Negative:**
- PostgreSQL requires a running database process, adding operational complexity compared to SQLite's file-based approach.
- Docker Compose must manage database lifecycle (startup ordering, health checks, volume persistence).
- The Docker image is larger due to the PostgreSQL dependency.
- Developers who are accustomed to SQLite for simple projects must learn PostgreSQL connection management and configuration.

### Alternatives Considered

| Alternative | Why Rejected |
|---|---|
| **SQLite** | SQLite uses file-level locking that does not support concurrent writes from multiple processes. Multi-kiosk readiness from day one is a core project goal, and migrating from SQLite to PostgreSQL later would require changing the connection protocol, SQL dialect, and deployment architecture. The upfront cost of PostgreSQL is justified. |
| **MySQL / MariaDB** | PostgreSQL offers superior JSONB support, more advanced indexing options (GIN, GiST), and better compliance with SQL standards. SQLAlchemy's async support is more mature with PostgreSQL via `asyncpg`. |
| **MongoDB** | The project's data model is relational (sessions belong to devices, payments belong to sessions, configurations are structured). A document database introduces unnecessary schema ambiguity. |

---

## ADR-004: python-escpos for Thermal Printer Communication

**Status:** Accepted
**Date:** 2025-01-15
**Decision Maker:** Core Team

### Context

VibePrint OS must drive USB thermal printers to produce receipts containing AI-generated text results and optionally a dithered thumbnail of the captured photo. Thermal printers communicate using the ESC/POS protocol, a binary command set developed by Epson that has become the de facto standard for thermal receipt printers. The backend needs a reliable way to send ESC/POS commands over USB, handle image dithering for photo printing, and manage printer status detection.

### Decision

Use the **python-escpos** library for all thermal printer communication. This library provides a Pythonic API over the ESC/POS protocol, supports USB connectivity via PyUSB, includes built-in image dithering for photo printing, and handles common printer operations (text alignment, barcode generation, paper cutting, cash drawer kicking).

### Consequences

**Positive:**
- `python-escpos` abstracts the binary ESC/POS protocol into readable Python method calls (e.g., `printer.text()`, `printer.image()`, `printer.cut()`).
- Built-in image dithering (Floyd-Steinberg, threshold) converts captured photos into printable 1-bit images suitable for thermal paper.
- USB device identification by vendor ID and product ID allows reliable printer discovery across different Linux distributions.
- The library is actively maintained, has extensive documentation, and supports a wide range of thermal printer models.
- Printer profile system allows customization of paper width, character encoding, and code pages for different printer models.

**Negative:**
- `python-escpos` depends on `pyusb`, which requires `libusb` as a system-level dependency and appropriate USB device permissions on the host.
- USB device permissions require udev rules or running the container as a privileged user, which has security implications.
- The library's error handling for disconnected printers is limited; the application must implement its own retry logic and connection health checks.
- Image printing quality depends on the printer's DPI and the dithering algorithm chosen; calibration may be required for optimal results.
- Some thermal printer models have vendor-specific ESC/POS extensions that `python-escpos` does not support out of the box.

### Alternatives Considered

| Alternative | Why Rejected |
|---|---|
| **CUPS (Common UNIX Printing System)** | CUPS adds a full print server stack (daemon, drivers, spooler) that is overkill for direct ESC/POS communication. It introduces latency through its spooling system and abstracts away the low-level control needed for real-time kiosk printing (paper cutting, cash drawer control). |
| **Custom USB driver** | Writing a custom USB driver would require deep knowledge of the USB protocol and ESC/POS command set. This approach duplicates the work already done by `python-escpos` and increases maintenance burden. |
| **Serial (RS-232) communication** | Some thermal printers support RS-232, but USB is the standard connection for modern printers. Serial communication requires additional hardware adapters and has lower throughput for image data. |

---

## ADR-005: Provider-Agnostic AI Abstraction Layer

**Status:** Accepted
**Date:** 2025-01-15
**Decision Maker:** Core Team

### Context

VibePrint OS sends captured images to an AI provider for analysis (e.g., personality reading, style assessment, fortune telling). The project is open-source, so users must be able to choose their preferred AI provider. Some operators may want to use local models via Ollama for privacy and cost control, while others may prefer cloud providers (OpenAI, Anthropic, Google) for quality. The system must support multiple providers behind a common interface without requiring code changes when switching.

### Decision

Implement a **provider-agnostic AI abstraction layer** using a strategy pattern. A base `AIProvider` abstract class defines the interface (`analyze_image(image_bytes, prompt) -> str`), and concrete implementations handle communication with each provider (OpenAI, Anthropic, Google Gemini, Ollama). The active provider is selected via configuration, and the backend instantiates the appropriate implementation at startup.

### Consequences

**Positive:**
- Users can switch AI providers by changing a single configuration value (`AI_PROVIDER=openai` / `ollama` / `anthropic` / `google`) without modifying application code.
- The abstraction enables local AI inference via Ollama, which eliminates ongoing API costs and keeps user data private on the kiosk machine.
- New providers can be added by implementing the `AIProvider` interface, encouraging community contributions.
- Each provider implementation handles its own authentication, retry logic, rate limiting, and error mapping to a common exception hierarchy.
- A mock provider is included for testing, returning deterministic responses without network calls.

**Negative:**
- The abstraction layer adds indirection, making it slightly harder to debug provider-specific issues.
- Provider-specific features (e.g., OpenAI's structured output, Anthropic's thinking mode) cannot be fully exposed through a generic interface without leaky abstractions.
- Maintaining multiple provider implementations increases the testing surface area.
- Rate limits, pricing models, and API deprecation schedules differ across providers, requiring per-provider monitoring.

### Alternatives Considered

| Alternative | Why Rejected |
|---|---|
| **Single provider (OpenAI only)** | Locking into a single provider contradicts the open-source ethos and creates a mandatory external dependency. Users in regions with limited API access or those who prefer local models would be excluded. |
| **LiteLLM proxy** | LiteLLM provides a unified API for multiple LLM providers, but it runs as a separate service, adding deployment complexity. For the single-endpoint use case of VibePrint OS, a lightweight abstraction class within the application is simpler and has no additional infrastructure requirements. |
| **LangChain** | LangChain is a full LLM orchestration framework with significant abstraction overhead. VibePrint OS only needs a single method call (send image, receive text), making LangChain's chain, agent, and memory abstractions unnecessary complexity. |

---

## ADR-006: QRIS via Midtrans as Primary Payment Gateway

**Status:** Accepted
**Date:** 2025-01-15
**Decision Maker:** Core Team

### Context

VibePrint OS supports an optional payment step in the kiosk flow. When enabled, users scan a QRIS (Quick Response Code Indonesian Standard) QR code to pay before the photo session begins. QRIS is the national standard for QR-based payments in Indonesia and is supported by all major Indonesian banks and e-wallets (GoPay, OVO, DANA, ShopeePay). The payment gateway must generate QRIS QR codes, receive webhook callbacks when payments are completed, and provide APIs for checking payment status.

### Decision

Use **Midtrans** as the primary payment gateway, with a toggle-able integration that is off by default. Midtrans provides a well-documented REST API for QRIS payment creation, webhook callbacks with signature verification, and a sandbox environment for testing. The payment module is implemented behind an abstraction layer (similar to the AI provider pattern) so that other gateways (Xendit, Duitku) can be added as alternative implementations.

### Consequences

**Positive:**
- Midtrans is one of the most widely used payment gateways in Indonesia, with comprehensive QRIS support and reliable webhook delivery.
- The sandbox environment allows full payment flow testing without real money, essential for development and CI environments.
- Midtrans's API documentation and SDK examples are thorough, reducing integration time.
- The toggle-able design means operators who do not need payment (e.g., free events, private use) can disable the feature entirely with zero overhead.
- The payment abstraction allows future integration with other gateways (Xendit, Duitku) by implementing the same interface.

**Negative:**
- Midtrans requires a registered business account for production use, which may not be available to all users.
- Webhook callbacks require the kiosk machine to be reachable from the public internet, necessitating a reverse proxy or tunnel (e.g., ngrok) for development.
- Midtrans charges transaction fees (varies by payment method), which operators must factor into their pricing.
- QRIS payments have a timeout (typically 15 minutes), and the kiosk flow must handle expired payment sessions gracefully.

### Alternatives Considered

| Alternative | Why Rejected |
|---|---|
| **Xendit** | Xendit is a strong alternative with competitive pricing, but Midtrans has broader QRIS bank support and a more mature sandbox environment. Xendit is retained as an alternative implementation behind the payment abstraction. |
| **Duitku** | Duitku has fewer QRIS payment method options and less comprehensive documentation compared to Midtrans. |
| **Stripe** | Stripe does not natively support QRIS payments. While Stripe supports QR-based payments in other regions, it is not the right choice for the Indonesian market that VibePrint OS primarily targets. |
| **Direct bank API integration** | Integrating directly with each bank's API would require maintaining separate implementations for every bank and e-wallet. Payment gateways aggregate these integrations, reducing maintenance burden significantly. |

---

## ADR-007: Docker Compose for Single-Machine Deployment

**Status:** Accepted
**Date:** 2025-01-15
**Decision Maker:** Core Team

### Context

VibePrint OS is designed to run on a single Linux machine (Ubuntu/Debian) that is physically colocated with the thermal printer and camera. The deployment must be reproducible, easy to update, and resilient to system-level changes. The target operators are not expected to have advanced DevOps skills, so the deployment process must be as simple as possible.

### Decision

Use **Docker Compose** for the entire deployment. Two containers are defined: the application container (running FastAPI with the built frontend static files served via `StaticFiles`) and the PostgreSQL database container. USB devices (thermal printer and camera) are passed through to the application container using Docker's `devices` configuration.

### Consequences

**Positive:**
- Docker Compose provides a single `docker compose up -d` command to start the entire stack, lowering the operational barrier for non-technical operators.
- Containerization ensures the application runs in a consistent environment regardless of the host system's installed packages.
- Volume mounts for PostgreSQL data persist across container restarts and image updates.
- Docker Compose's dependency management (`depends_on` with health checks) ensures the database is ready before the application starts.
- The `docker compose pull && docker compose up -d` update pattern is simple and safe.
- USB device passthrough via the `devices` configuration gives the application container direct access to the thermal printer and camera hardware.

**Negative:**
- Docker Compose does not provide built-in zero-downtime deployments; updating the application container causes a brief interruption.
- Docker Compose is limited to single-machine deployments; scaling to multiple kiosks sharing a database would require either separate Compose stacks or migrating to Kubernetes.
- USB device passthrough requires the Docker daemon to have appropriate permissions, and some USB devices may not pass through correctly in all kernel versions.
- Docker adds a layer of abstraction that can complicate hardware debugging (e.g., USB device not visible inside the container requires checking both host permissions and Docker configuration).

### Alternatives Considered

| Alternative | Why Rejected |
|---|---|
| **Kubernetes** | Kubernetes is designed for multi-node, auto-scaling deployments. Running a single-node Kubernetes cluster (K3s, minikube) adds significant complexity for no benefit when the application runs on a single machine. Operator familiarity with Kubernetes is low. |
| **Bare metal (systemd services)** | Running Python and PostgreSQL directly on the host requires manual dependency management, is sensitive to OS updates, and makes reproducible deployments difficult. Docker eliminates "works on my machine" issues. |
| **Ansible + systemd** | Ansible could automate bare-metal provisioning, but it still requires managing system packages, Python virtual environments, and PostgreSQL installation separately. Docker Compose achieves the same reproducibility with less tooling. |

---

## ADR-008: Chromium --kiosk Mode over Electron

**Status:** Accepted
**Date:** 2025-01-15
**Decision Maker:** Core Team

### Context

The VibePrint OS kiosk UI must run in a fullscreen, locked-down browser environment that prevents users from accessing the operating system, closing the browser, or navigating away from the kiosk application. The UI is a React SPA that communicates with the FastAPI backend via REST API calls. The frontend needs MJPEG stream rendering, touch event handling, and smooth CSS/JS animations.

### Decision

Use **Chromium** launched in `--kiosk` mode on the host machine, pointing at the FastAPI backend which serves the built React SPA static files. A shell script (`scripts/start-kiosk.sh`) launches Chromium with the appropriate flags and runs as a systemd service for automatic startup.

### Consequences

**Positive:**
- Chromium in `--kiosk` mode runs fullscreen, hides the address bar and tabs, disables keyboard shortcuts (Ctrl+Q, Alt+F4, F11), and prevents navigation away from the configured URL.
- No additional runtime or packaging step is required; the frontend is served as static files by FastAPI, and Chromium is a standard system package on Ubuntu/Debian.
- Memory usage is significantly lower than Electron because Chromium shares the system's renderer process and does not bundle a separate Node.js runtime.
- Updates to the frontend are deployed by rebuilding the Docker image and restarting the container; no Electron app packaging or distribution is needed.
- Chromium's V8 engine is kept up to date through system package updates, ensuring security patches are applied without application-level changes.

**Negative:**
- Chromium must be installed on the host system and kept in sync with the display server (X11 or Wayland). Some kiosk setups may require specific Chromium flags for GPU acceleration or display configuration.
- The kiosk lockdown relies on Chromium flags and X11/Wayland window manager configuration; a determined user with physical access could potentially break out of kiosk mode (though this is a limitation shared by all software-based kiosk solutions).
- Automated testing of the kiosk mode behavior (fullscreen, shortcut blocking) is difficult without a display server in CI.
- Different Linux distributions may ship different Chromium versions with varying `--kiosk` flag behavior.

### Alternatives Considered

| Alternative | Why Rejected |
|---|---|
| **Electron** | Electron bundles a full Chromium runtime and Node.js into the application, adding 100-200 MB of memory overhead. For VibePrint OS, where Chromium is already available on the host and the frontend is served by the FastAPI backend, Electron duplicates functionality without benefit. Electron's `BrowserWindow` kiosk mode offers similar lockdown capabilities to Chromium's `--kiosk` flag. |
| **Firefox Kiosk** | Firefox supports a kiosk mode via extension, but its MJPEG rendering performance is lower than Chromium's, and the configuration is less straightforward. Chromium is the standard for digital signage and kiosk applications. |
| **Custom Qt/QML application** | A native Qt application would provide the most control over the kiosk environment, but would require rewriting the entire React UI in QML, losing the benefit of the web technology stack. |

---

## Summary Table

| ADR | Technology | Category | Status |
|-----|-----------|----------|--------|
| ADR-001 | Python 3.12+ / FastAPI | Backend Framework | Accepted |
| ADR-002 | React 19 / TypeScript 5 / Vite 6 | Frontend Framework | Accepted |
| ADR-003 | PostgreSQL 16 | Database | Accepted |
| ADR-004 | python-escpos | Hardware Integration | Accepted |
| ADR-005 | Provider-agnostic AI abstraction | AI Integration | Accepted |
| ADR-006 | Midtrans QRIS | Payment Gateway | Accepted |
| ADR-007 | Docker Compose | Deployment | Accepted |
| ADR-008 | Chromium --kiosk mode | Kiosk Runtime | Accepted |
