# VibePrint OS -- Project Structure Guide

> This document describes the complete project directory structure, explains the purpose of each directory and file, and defines naming and import conventions used throughout the codebase.

---

## Table of Contents

1. [Top-Level Directory Overview](#1-top-level-directory-overview)
2. [Backend Directory Conventions](#2-backend-directory-conventions)
3. [Frontend Directory Conventions](#3-frontend-directory-conventions)
4. [Root-Level Files](#4-root-level-files)
5. [Naming Conventions](#5-naming-conventions)
6. [Import Conventions and Module Boundaries](#6-import-conventions-and-module-boundaries)

---

## 1. Top-Level Directory Overview

```
thermavibe/
|
|-- backend/                    # Python FastAPI backend application
|-- frontend/                   # React 19 TypeScript frontend application
|-- docs/                       # Project documentation
|   `-- technical/              # Technical documentation (this file lives here)
|-- scripts/                    # Operational shell scripts
|-- config/                     # Configuration templates and fallback data
|   `-- fallback-templates/     # Default template files (e.g. fortune text)
|-- base-data/                  # Original source material (PRD, base ideas)
|-- .claude/                    # Claude Code agent context (CLAUDE.md, rules, state)
|-- .github/                    # GitHub-specific configuration (workflows, etc.)
|-- docker-compose.yml          # Production Docker Compose configuration
|-- docker-compose.dev.yml      # Development Docker Compose overrides
|-- .docker-compose.devices.yml # Device-specific Docker Compose overrides (USB passthrough)
|-- Dockerfile                  # Multi-stage Docker build (backend + frontend)
|-- Makefile                    # Common development commands
|-- .env.example                # Environment variable template
|-- .gitignore                  # Git ignore rules
|-- .editorconfig               # Editor configuration (indentation, charset)
|-- LICENSE                     # MIT license
|-- README.md                   # Project overview and quick start
|-- CLAUDE.md                   # Claude Code project-level instructions
|-- package.json                # Root-level NPM metadata (workspaces if applicable)
`-- package-lock.json           # Root-level NPM lock file
```

### Directory Purposes

| Directory | Purpose |
|-----------|---------|
| `backend/` | Contains the entire FastAPI backend: API routes, service layer, database models, schemas, core configuration, utilities, and tests. |
| `frontend/` | Contains the entire React 19 frontend: components, pages, hooks, Zustand stores, API client, and styling configuration. |
| `docs/` | All project documentation, organized by category (technical, user guides, operational). |
| `scripts/` | Shell scripts used during development and deployment (start-kiosk.sh, start-docker.sh, setup-dev.sh). |
| `config/` | Configuration templates and fallback data. Currently holds `fallback-templates/` with default content files (e.g. default fortune text). |
| `base-data/` | Original source material and PRD ideas that informed the project design. |
| `.claude/` | Claude Code agent context files: behavioral rules, coding standards, security standards, environment guide, templates, and project state. |
| `.github/` | GitHub-specific configuration (CI workflows, issue templates, etc.). |

---

## 2. Backend Directory Conventions

```
backend/
|
|-- app/                        # Main application package
|   |-- __init__.py             # Package marker
|   |-- main.py                 # FastAPI application factory, lifespan events, middleware
|   |
|   |-- api/                    # API layer (HTTP endpoints)
|   |   |-- __init__.py
|   |   |-- deps.py             # Shared dependencies (database session, auth, services)
|   |   `-- v1/                 # API version 1
|   |       |-- __init__.py
|   |       |-- router.py       # V1 API router that aggregates all endpoint routers
|   |       `-- endpoints/      # One file per API domain
|   |           |-- __init__.py
|   |           |-- kiosk.py    # Session management: create, get, capture, print, finish
|   |           |-- camera.py   # Camera: MJPEG stream, device listing, device selection
|   |           |-- ai.py       # AI: image analysis trigger
|   |           |-- payment.py  # Payment: QRIS creation, webhook callback, status polling
|   |           |-- print.py    # Print: test receipt, status check
|   |           `-- admin.py    # Admin: auth, config CRUD, analytics, hardware testing, themes
|   |
|   |-- services/               # Service layer (business logic)
|   |   |-- __init__.py
|   |   |-- session_service.py       # Session lifecycle, state machine transitions
|   |   |-- camera_service.py        # Camera device management, frame capture, MJPEG stream
|   |   |-- ai_service.py            # AI provider selection, API calls, retry logic, fallback
|   |   |-- payment_service.py       # Payment creation, webhook verification, status updates
|   |   |-- printer_service.py       # ESC/POS receipt assembly, printer management, print jobs
|   |   |-- config_service.py        # Configuration CRUD, validation, runtime application
|   |   |-- analytics_service.py     # Session aggregation, revenue reports, time-series queries
|   |   |-- access_code_service.py   # Access code generation, validation, management
|   |   |-- hardware_service.py      # Hardware detection and status (camera, printer)
|   |   |-- image_composition_service.py  # Image layout, compositing, frame overlay
|   |   |-- photobooth_service.py    # Photobooth session management and capture sequencing
|   |   |-- retention_service.py     # Data retention policy enforcement and cleanup
|   |   |-- share_service.py         # Digital sharing (QR download links, etc.)
|   |   `-- theme_service.py         # Photobooth theme CRUD and template management
|   |
|   |-- models/                 # SQLAlchemy ORM models (database tables)
|   |   |-- __init__.py         # Exports all models for Alembic auto-generation
|   |   |-- base.py             # SQLAlchemy DeclarativeBase, common mixins (timestamps, ID)
|   |   |-- session.py          # Session model (kiosk session state, timestamps, analysis)
|   |   |-- payment.py          # Payment model (transaction ID, amount, status, provider)
|   |   |-- configuration.py    # Config model (key-value configuration with categories)
|   |   |-- device.py           # Device model (camera/printer status, capabilities)
|   |   |-- access_code.py      # Access code model (code, price, usage tracking)
|   |   |-- analytics.py        # Analytics model (aggregated session/event data)
|   |   `-- photobooth_theme.py # Photobooth theme model (frame templates, layouts)
|   |
|   |-- schemas/                # Pydantic schemas (request/response validation)
|   |   |-- __init__.py
|   |   |-- session.py          # SessionCreate, SessionResponse, SessionState
|   |   |-- payment.py          # PaymentCreate, PaymentResponse, WebhookPayload
|   |   |-- configuration.py    # ConfigResponse, ConfigUpdate, ConfigCategory
|   |   |-- camera.py           # CameraDevice, CameraStreamConfig
|   |   |-- ai.py               # AIAnalysisRequest, AIAnalysisResponse
|   |   |-- print.py            # PrintJobRequest, PrintStatusResponse
|   |   |-- admin.py            # AdminLoginRequest, AdminAuthToken, AnalyticsResponse
|   |   |-- access_code.py      # AccessCodeCreate, AccessCodeResponse
|   |   |-- photobooth.py       # PhotoboothSessionRequest, PhotoboothCapture, theme schemas
|   |   `-- common.py           # Shared schemas: ErrorResponse, PaginationParams, SuccessResponse
|   |
|   |-- core/                   # Core infrastructure (config, database, security, lifecycle)
|   |   |-- __init__.py
|   |   |-- config.py           # Settings class (Pydantic BaseSettings, loads from .env)
|   |   |-- database.py         # Async SQLAlchemy engine, session factory, Base metadata
|   |   |-- security.py         # PIN hashing, JWT token generation, signature verification
|   |   |-- exceptions.py       # Custom exception classes (NotFound, PaymentError, PrinterError)
|   |   |-- middleware.py       # CORS, request logging, error handling middleware
|   |   |-- events.py           # Application event handlers (startup/shutdown hooks)
|   |   `-- lifecycle.py        # Application startup/shutdown lifecycle management
|   |
|   |-- ai/                     # AI provider implementations (strategy pattern)
|   |   |-- __init__.py
|   |   |-- base.py             # AIProvider abstract base class
|   |   |-- openai_provider.py  # OpenAI GPT-4 Vision implementation
|   |   |-- anthropic_provider.py # Anthropic Claude implementation
|   |   |-- google_provider.py  # Google Gemini Vision implementation
|   |   |-- ollama_provider.py  # Ollama local model implementation
|   |   `-- mock_provider.py    # Mock provider for testing (returns canned responses)
|   |
|   |-- payment/                # Payment gateway implementations (strategy pattern)
|   |   |-- __init__.py
|   |   |-- base.py             # PaymentProvider abstract base class
|   |   |-- midtrans_provider.py # Midtrans QRIS implementation
|   |   |-- xendit_provider.py  # Xendit QRIS implementation
|   |   `-- mock_provider.py    # Mock provider for testing (simulates payment flow)
|   |
|   `-- utils/                  # Shared utilities (pure functions, no side effects)
|       |-- __init__.py
|       |-- dithering.py        # Floyd-Steinberg dithering, threshold dithering
|       |-- escpos.py           # ESC/POS command builders, image formatting helpers
|       |-- image.py            # Image resize, crop, compress, format conversion
|       |-- validators.py       # Input validation helpers (phone, email, config values)
|       `-- logging.py          # Structured JSON logging setup, correlation ID middleware
|
|-- tests/                      # Backend tests
|   |-- __init__.py
|   |-- conftest.py             # Shared pytest fixtures (test client, test DB, mock services)
|   |-- unit/                   # Unit tests (no external dependencies, fully mocked)
|   |   |-- __init__.py
|   |   |-- test_session_service.py
|   |   |-- test_camera_service.py
|   |   |-- test_ai_service.py
|   |   |-- test_payment_service.py
|   |   |-- test_printer_service.py
|   |   |-- test_config_service.py
|   |   |-- test_access_code_service.py
|   |   |-- test_analytics_service.py
|   |   |-- test_hardware_service.py
|   |   |-- test_retention_service.py
|   |   |-- test_exceptions.py
|   |   `-- test_security.py
|   |
|   `-- integration/            # Integration tests (real DB, mocked external services)
|       |-- __init__.py
|       |-- test_kiosk_flow.py
|       |-- test_payment_flow.py
|       |-- test_admin_flow.py
|       `-- test_ai_flow.py
|
|-- alembic/                    # Database migrations
|   |-- env.py                  # Alembic configuration (imports SQLAlchemy metadata)
|   |-- script.py.mako          # Migration script template
|   `-- versions/               # Generated migration files
|       |-- d596d3d1a363_initial.py
|       |-- 7bf4bbccb2f1_add_access_codes_table.py
|       |-- 672b4ee7_add_price_to_access_codes.py
|       |-- a3f7c2e1b8d4_add_photobooth_support.py
|       `-- e7a2f1b4c8d9_add_review_state_and_photos.py
|
|-- alembic.ini                 # Alembic configuration file
`-- pyproject.toml              # Python project metadata and dependency management (Ruff, pytest)
```

### Endpoint File Convention

Each file in `backend/app/api/v1/endpoints/` corresponds to one API domain. The file defines an `APIRouter` with a prefix and tags, and contains one route function per endpoint. Route functions are thin: they validate request data (via Pydantic), call the appropriate service method, and return the response.

```python
# backend/app/api/v1/endpoints/kiosk.py

from fastapi import APIRouter, Depends
from backend.app.schemas.session import SessionResponse, SessionCreate
from backend.app.services.session_service import SessionService
from backend.app.api.deps import get_session_service

router = APIRouter(prefix="/kiosk", tags=["kiosk"])

@router.post("/session", response_model=SessionResponse, status_code=201)
async def create_session(
    service: SessionService = Depends(get_session_service),
) -> SessionResponse:
    session = await service.create_session()
    return SessionResponse.model_validate(session)
```

### Service File Convention

Each file in `backend/app/services/` contains one service class. Service classes are instantiated per-request via FastAPI's dependency injection. Services accept database sessions and other dependencies through their constructor, enabling easy mocking in tests.

```python
# backend/app/services/session_service.py

from sqlalchemy.ext.asyncio import AsyncSession
from backend.app.models.session import Session
from backend.app.core.database import get_db_session

class SessionService:
    def __init__(self, db: AsyncSession | None = None):
        self.db = db

    async def create_session(self) -> Session:
        session = Session(state="IDLE")
        self.db.add(session)
        await self.db.commit()
        await self.db.refresh(session)
        return session
```

### Model File Convention

Each file in `backend/app/models/` defines one or more SQLAlchemy ORM models. All models inherit from the `Base` class defined in `models/base.py`, which provides common fields (id, created_at, updated_at).

### Schema File Convention

Each file in `backend/app/schemas/` defines Pydantic models for request/response validation. Schemas are named with a suffix indicating their role: `Create` for request bodies, `Response` for response bodies, and `Update` for partial update bodies.

---

## 3. Frontend Directory Conventions

```
frontend/
|
|-- public/                     # Static assets served directly (favicon, images)
|   `-- favicon.ico
|
|-- src/
|   |-- main.tsx                # React application entry point
|   |-- App.tsx                 # Root component with React Router
|   |-- vite-env.d.ts           # Vite type declarations
|   |-- index.css               # Global styles (Tailwind CSS base, CSS custom properties)
|   |
|   |-- components/             # React components organized by domain
|   |   |-- kiosk/              # Public kiosk screen components
|   |   |   |-- IdleScreen.tsx              # Welcome screen with "Start" button
|   |   |   |-- AccessCodeScreen.tsx        # Access code entry with numpad
|   |   |   |-- FeatureSelectScreen.tsx     # Choose between vibe check / photobooth modes
|   |   |   |-- PaymentScreen.tsx           # QRIS QR code display with countdown
|   |   |   |-- CaptureScreen.tsx           # Live camera preview for vibe check capture
|   |   |   |-- PhotoboothCaptureScreen.tsx # Multi-shot photobooth capture flow
|   |   |   |-- ProcessingScreen.tsx        # AI analysis loading animation
|   |   |   |-- RevealScreen.tsx            # Vibe check result display with print/share
|   |   |   |-- PhotoboothRevealScreen.tsx  # Photobooth strip reveal with print/share
|   |   |   |-- ReviewScreen.tsx            # Photo review and selection before processing
|   |   |   |-- ArrangeScreen.tsx           # Photo arrangement/layout editor
|   |   |   |-- FrameSelectScreen.tsx       # Frame/theme selection for photobooth
|   |   |   |-- VirtualNumpad.tsx           # On-screen numeric keypad for access codes
|   |   |   `-- KioskShell.tsx              # Common layout wrapper for kiosk screens
|   |   |
|   |   |-- admin/              # Admin dashboard components
|   |   |   |-- AdminLayout.tsx              # Sectioned sidebar + content layout
|   |   |   |-- AiConfig.tsx                 # AI provider configuration (keys, model selection)
|   |   |   |-- AnalyticsDashboard.tsx       # Session and revenue analytics charts
|   |   |   |-- AnalyticsExportButton.tsx    # Export analytics data (CSV/PDF)
|   |   |   |-- HardwareSetup.tsx            # Camera + printer status display and testing
|   |   |   |-- PaymentAccessConfig.tsx      # Payment and access code configuration
|   |   |   |-- PhotoboothConfig.tsx         # Photobooth settings (countdown, strips, layout)
|   |   |   |-- PrintTemplateConfig.tsx      # Print template management
|   |   |   |-- ThemeManager.tsx             # Photobooth theme CRUD and preview
|   |   |   `-- VibeCheckConfig.tsx          # Vibe check feature configuration
|   |   |
|   |   |-- ErrorBoundary.tsx   # React error boundary wrapper for kiosk and admin
|   |   |
|   |   `-- ui/                 # shadcn/ui base components (copy-paste pattern)
|   |       |-- badge.tsx
|   |       |-- button.tsx
|   |       |-- card.tsx
|   |       |-- dialog.tsx
|   |       |-- dropdown-menu.tsx
|   |       |-- input.tsx
|   |       |-- label.tsx
|   |       |-- progress.tsx
|   |       |-- select.tsx
|   |       |-- separator.tsx
|   |       |-- sheet.tsx
|   |       |-- sonner.tsx
|   |       |-- switch.tsx
|   |       |-- table.tsx
|   |       |-- tabs.tsx
|   |       |-- textarea.tsx
|   |       `-- tooltip.tsx
|   |
|   |-- hooks/                  # Custom React hooks
|   |   |-- useKioskState.ts    # Zustand store hook for kiosk state machine
|   |   |-- useSession.ts       # React Query hook for session API calls
|   |   |-- usePayment.ts       # React Query hook for payment status polling
|   |   |-- useCamera.ts        # Camera stream URL and device management
|   |   |-- usePrinter.ts       # Print job trigger and status polling
|   |   |-- useCountdown.ts     # Countdown timer hook (configurable duration)
|   |   |-- useMediaQuery.ts    # Responsive breakpoint detection (for admin dashboard)
|   |   `-- usePhotoboothState.ts  # Photobooth multi-shot capture state management
|   |
|   |-- stores/                 # Zustand state stores
|   |   |-- kioskStore.ts       # Kiosk state machine: current state, session data, transitions
|   |   `-- adminStore.ts       # Admin authentication state, selected config category
|   |
|   |-- api/                    # API client layer
|   |   |-- client.ts           # Axios/fetch instance with base URL, interceptors, error handling
|   |   |-- kioskApi.ts         # Kiosk session API calls (create, get, capture, print, finish)
|   |   |-- cameraApi.ts        # Camera API calls (stream URL, devices, select)
|   |   |-- paymentApi.ts       # Payment API calls (create QR, status polling)
|   |   |-- adminApi.ts         # Admin API calls (login, config, analytics, hardware)
|   |   |-- photoboothApi.ts    # Photobooth session and theme API calls
|   |   `-- types.ts            # TypeScript type definitions matching backend Pydantic schemas
|   |
|   |-- pages/                  # Route-level page components
|   |   |-- KioskPage.tsx               # Route: / (public kiosk flow)
|   |   |-- AdminLoginPage.tsx          # Route: /admin/login
|   |   |-- AdminPage.tsx               # Route: /admin (redirects to dashboard or login)
|   |   |-- AdminDashboardPage.tsx      # Route: /admin/dashboard
|   |   |-- AdminAnalyticsPage.tsx      # Route: /admin/analytics
|   |   |-- AdminHardwarePage.tsx       # Route: /admin/hardware
|   |   |-- AdminAiProviderPage.tsx     # Route: /admin/ai-provider
|   |   |-- AdminPhotoboothPage.tsx     # Route: /admin/photobooth
|   |   |-- AdminPrintTemplatePage.tsx  # Route: /admin/print-templates
|   |   |-- AdminPaymentAccessPage.tsx  # Route: /admin/payment-access
|   |   |-- AdminVibeCheckPage.tsx      # Route: /admin/vibe-check
|   |   |-- AdminStripsGalleryPage.tsx  # Route: /admin/strips-gallery
|   |   `-- NotFoundPage.tsx            # Route: * (404 fallback)
|   |
|   |-- lib/                    # Frontend utilities
|   |   |-- utils.ts            # shadcn/ui utility functions (cn helper for className merging)
|   |   |-- constants.ts        # App-wide constants (API routes, timeouts, defaults)
|   |   |-- formatters.ts       # Display formatters (currency, date, duration)
|   |   `-- export/             # Data export utilities
|   |       |-- index.ts        # Re-exports for all export functions
|   |       |-- csv.ts          # CSV file generation
|   |       |-- pdf.ts          # PDF report generation
|   |       |-- fileDownload.ts # Browser file download trigger
|   |       `-- types.ts        # Export-specific type definitions
|   |
|   `-- __tests__/              # Frontend tests
|       |-- setup.ts            # Vitest global setup (jest-dom matchers)
|       |-- components/         # Component tests
|       |   |-- IdleScreen.test.tsx
|       |   |-- CaptureScreen.test.tsx
|       |   |-- RevealScreen.test.tsx
|       |   `-- AdminLoginPage.test.tsx
|       |-- hooks/              # Hook tests
|       |   `-- useCountdown.test.ts
|       |-- stores/             # Store tests
|       |   |-- kioskStore.test.ts
|       |   `-- adminStore.test.ts
|       `-- mocks/              # MSW handlers and mock data
|           |-- handlers.ts
|           `-- server.ts
|
|-- index.html                  # HTML entry point
|-- vite.config.ts              # Vite configuration (plugins, proxy, build)
|-- vitest.config.ts            # Vitest test configuration
|-- tailwind.config.ts          # Tailwind CSS configuration
|-- tsconfig.json               # Root TypeScript configuration (references)
|-- tsconfig.app.json           # TypeScript configuration for app source
|-- tsconfig.node.json          # TypeScript configuration for Vite config files
|-- postcss.config.js           # PostCSS configuration (Tailwind, autoprefixer)
|-- components.json             # shadcn/ui configuration (component paths, style)
|-- eslint.config.js            # ESLint flat config
|-- package.json                # NPM dependencies and scripts
`-- package-lock.json           # NPM lock file
```

### Kiosk Component Organization

The kiosk flow is implemented as a set of screen components in `components/kiosk/`, each corresponding to one state in the kiosk state machine. The `KioskShell` component wraps all screens and handles common concerns (fullscreen container, error boundary, touch event optimization).

The `KioskPage` component selects which screen to render based on the current state from the Zustand store:

```tsx
// frontend/src/pages/KioskPage.tsx

import { useKioskStore } from '@/stores/kioskStore';
import { IdleScreen } from '@/components/kiosk/IdleScreen';
import { FeatureSelectScreen } from '@/components/kiosk/FeatureSelectScreen';
import { CaptureScreen } from '@/components/kiosk/CaptureScreen';
import { ProcessingScreen } from '@/components/kiosk/ProcessingScreen';
import { RevealScreen } from '@/components/kiosk/RevealScreen';

export function KioskPage() {
  const state = useKioskStore((s) => s.currentState);

  return (
    <KioskShell>
      {state === 'IDLE' && <IdleScreen />}
      {state === 'FEATURE_SELECT' && <FeatureSelectScreen />}
      {state === 'CAPTURE' && <CaptureScreen />}
      {state === 'PROCESSING' && <ProcessingScreen />}
      {state === 'REVEAL' && <RevealScreen />}
    </KioskShell>
  );
}
```

### Admin Component Organization

Admin components follow a page-based structure where each route in `/admin` renders a page component. Each page composes smaller admin components from `components/admin/`. The `AdminLayout` provides the sectioned sidebar navigation and content area. Admin pages are thin wrappers that import and compose the relevant admin component.

### shadcn/ui Component Management

Components in `components/ui/` are installed using the shadcn/ui CLI and are copied directly into the project (not installed as an npm dependency). This gives full control over styling and behavior. When updating shadcn/ui components, use `npx shadcn@latest add <component>` to re-import and merge changes. Configuration for shadcn/ui is stored in `components.json`.

---

## 4. Root-Level Files

```
thermavibe/
|
|-- docker-compose.yml          # Production Docker Compose file
|                               # Defines: app (FastAPI), postgres services
|                               # Uses: Dockerfile for build, named volumes for data
|
|-- docker-compose.dev.yml      # Development overrides
|                               # Adds: backend source volume mount, frontend dev proxy
|                               # Overrides: ports, environment variables, restart policy
|
|-- .docker-compose.devices.yml # Device-specific overrides
|                               # Adds: USB device passthrough for printer/camera
|
|-- Dockerfile                  # Multi-stage production build
|                               # Stage 1: Build frontend (npm build)
|                               # Stage 2: Install Python deps, copy backend + built frontend
|
|-- Makefile                    # Common commands:
|                               #   make dev      - Start development environment
|                               #   make test     - Run all tests
|                               #   make lint     - Run linters (Ruff, ESLint)
|                               #   make migrate  - Run database migrations
|                               #   make build    - Build production Docker image
|                               #   make deploy   - Deploy production stack
|                               #   make backup   - Backup PostgreSQL data
|
|-- .env.example                # Template for environment variables
|                               # Copy to .env and fill in values
|                               # Contains: DB credentials, API keys, printer config, PIN
|
|-- .gitignore                  # Ignores: .env, node_modules/, __pycache__/,
|                               #   dist/, .venv/, *.pyc, .DS_Store
|
|-- .editorconfig               # Consistent editor settings:
|                               #   indent_style = space, indent_size = 2 (frontend)
|                               #   indent_size = 4 (backend), charset = utf-8
|
|-- LICENSE                     # MIT License
|
|-- README.md                   # Project overview, features, quick start, screenshots
|
|-- CLAUDE.md                   # Claude Code project-level instructions (agent context)
|
|-- package.json                # Root-level NPM metadata
|-- package-lock.json           # Root-level NPM lock file
```

---

## 5. Naming Conventions

### Python (Backend)

| Element | Convention | Example |
|---------|-----------|---------|
| Files and directories | `snake_case` | `session_service.py`, `ai_service.py` |
| Classes | `PascalCase` | `SessionService`, `AIProvider`, `SessionResponse` |
| Functions and methods | `snake_case` | `create_session()`, `analyze_image()` |
| Variables | `snake_case` | `session_id`, `printer_connection` |
| Constants | `UPPER_SNAKE_CASE` | `MAX_RETRIES`, `DEFAULT_TIMEOUT` |
| Private methods | Leading underscore | `_validate_transition()`, `_build_escpos_commands()` |
| Async functions | `snake_case` with `async` keyword | `async def create_session()` |
| Pydantic models | `PascalCase` with suffix | `SessionCreate`, `SessionResponse`, `ConfigUpdate` |
| SQLAlchemy models | `PascalCase` | `Session`, `Payment`, `DeviceConfig` |
| Test files | `test_` prefix | `test_session_service.py` |
| Test functions | `test_` prefix, descriptive | `test_create_session_returns_idle_state()` |

### TypeScript (Frontend)

| Element | Convention | Example |
|---------|-----------|---------|
| Files and directories | `kebab-case` or `PascalCase` for components | `kioskStore.ts`, `IdleScreen.tsx` |
| React components | `PascalCase` | `IdleScreen`, `PaymentScreen`, `CameraPreview` |
| React component files | `PascalCase.tsx` | `IdleScreen.tsx`, `AdminLayout.tsx` |
| Custom hooks | `camelCase` with `use` prefix | `useKioskState`, `usePayment`, `useCountdown` |
| Hook files | `camelCase.ts` | `useKioskState.ts`, `useSession.ts` |
| Utility functions | `camelCase` | `formatCurrency()`, `cn()` |
| Utility files | `camelCase.ts` | `formatters.ts`, `constants.ts` |
| TypeScript interfaces/types | `PascalCase` | `SessionResponse`, `PaymentStatus` |
| Store files | `camelCase` with `Store` suffix | `kioskStore.ts`, `adminStore.ts` |
| API files | `camelCase` with `Api` suffix | `kioskApi.ts`, `paymentApi.ts` |
| CSS class names | Tailwind utilities (no custom classes except `cn()`) | `flex items-center gap-4` |
| Test files | `.test.ts` or `.test.tsx` suffix | `IdleScreen.test.tsx` |

### CSS/Styling

| Element | Convention | Example |
|---------|-----------|---------|
| Tailwind utilities | Single-line, alphabetical | `flex items-center justify-center rounded-lg bg-blue-500 p-4 text-white` |
| CSS custom properties | `--kebab-case` | `--color-primary`, `--spacing-kiosk` |
| Animation variants | `camelCase` in Framer Motion | `fadeIn: { opacity: [0, 1] }` |

---

## 6. Import Conventions and Module Boundaries

### Python Import Order

Python files follow the import ordering convention enforced by Ruff (I001: isort). Imports are grouped and separated by blank lines:

```python
# 1. Standard library imports
import os
import uuid
from datetime import datetime

# 2. Third-party imports
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

# 3. Local application imports
from backend.app.models.session import Session
from backend.app.schemas.session import SessionResponse
from backend.app.services.session_service import SessionService
from backend.app.core.config import Settings
from backend.app.core.exceptions import SessionNotFoundError
```

### Python Module Boundaries

The following dependency rules must be followed:

| Layer | May Import From | Must Not Import From |
|-------|----------------|---------------------|
| `api/endpoints/` | `services/`, `schemas/`, `core/`, `api/deps.py` | `models/` (directly), `utils/` |
| `services/` | `models/`, `schemas/`, `core/`, `utils/`, `ai/`, `payment/` | `api/` |
| `models/` | `core/database.py` (Base only) | `services/`, `api/`, `schemas/` |
| `schemas/` | `core/` (shared enums) | `models/`, `services/`, `api/` |
| `ai/` | `core/`, `utils/` | `api/`, `services/`, `models/` |
| `payment/` | `core/`, `utils/` | `api/`, `services/`, `models/` |
| `utils/` | No internal dependencies | All other packages |
| `core/` | No internal dependencies (leaf package) | All other packages |

### TypeScript Import Order

TypeScript files follow this import ordering enforced by ESLint:

```typescript
// 1. React and framework imports
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';

// 2. Third-party imports
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

// 3. Local application imports (absolute paths with @ alias)
import { useKioskStore } from '@/stores/kioskStore';
import { useSession } from '@/hooks/useSession';
import { apiClient } from '@/api/client';
import type { SessionResponse } from '@/api/types';
```

### TypeScript Module Boundaries

| Directory | May Import From | Must Not Import From |
|-----------|----------------|---------------------|
| `pages/` | `components/`, `hooks/`, `stores/`, `api/` | Other `pages/` |
| `components/kiosk/` | `components/ui/`, `hooks/`, `stores/`, `api/` | `components/admin/`, `pages/` |
| `components/admin/` | `components/ui/`, `hooks/`, `stores/`, `api/` | `components/kiosk/`, `pages/` |
| `components/ui/` | `lib/utils.ts` only | `hooks/`, `stores/`, `api/`, `pages/` |
| `hooks/` | `stores/`, `api/`, `lib/` | `components/`, `pages/` |
| `stores/` | `api/types.ts` for type imports only | `components/`, `hooks/`, `pages/` |
| `api/` | No internal imports (leaf module) | All other directories |

### Path Aliases

The frontend uses TypeScript path aliases configured in both `tsconfig.json` and `vite.config.ts`:

```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

All imports use the `@/` alias instead of relative paths:

```typescript
// Preferred
import { Button } from '@/components/ui/button';
import { useKioskStore } from '@/stores/kioskStore';

// Avoid
import { Button } from '../../components/ui/button';
import { useKioskStore } from '../stores/kioskStore';
```
