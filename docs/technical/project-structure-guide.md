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
|-- config/                     # Configuration templates and seed data
|-- tests/                      # Cross-cutting integration tests (if any)
|-- docker-compose.yml          # Production Docker Compose configuration
|-- docker-compose.dev.yml      # Development Docker Compose overrides
|-- Dockerfile                  # Multi-stage Docker build (backend + frontend)
|-- Dockerfile.dev              # Development Docker build (backend only)
|-- Makefile                    # Common development commands
|-- .env.example                # Environment variable template
|-- .gitignore                  # Git ignore rules
|-- .editorconfig               # Editor configuration (indentation, charset)
|-- README.md                   # Project overview and quick start
```

### Directory Purposes

| Directory | Purpose |
|-----------|---------|
| `backend/` | Contains the entire FastAPI backend: API routes, service layer, database models, schemas, core configuration, utilities, and tests. |
| `frontend/` | Contains the entire React 19 frontend: components, pages, hooks, Zustand stores, API client, and styling configuration. |
| `docs/` | All project documentation, organized by category (technical, user guides, operational). |
| `scripts/` | Shell scripts used during development and deployment (start-kiosk.sh, setup-udev.sh, backup.sh). |
| `config/` | Configuration templates (`.env.example`), seed data for the database, and printer/camera configuration profiles. |
| `tests/` | Cross-cutting integration tests that span backend and frontend (rare; most tests live within `backend/tests/` and `frontend/src/__tests__/`). |

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
|   |           `-- admin.py    # Admin: auth, config CRUD, analytics, hardware testing
|   |
|   |-- services/               # Service layer (business logic)
|   |   |-- __init__.py
|   |   |-- kiosk_service.py    # Session lifecycle, state machine transitions
|   |   |-- camera_service.py   # Camera device management, frame capture, MJPEG stream
|   |   |-- ai_service.py       # AI provider selection, API calls, retry logic, fallback
|   |   |-- payment_service.py  # Payment creation, webhook verification, status updates
|   |   |-- print_service.py    # ESC/POS receipt assembly, printer management, print jobs
|   |   |-- config_service.py   # Configuration CRUD, validation, runtime application
|   |   `-- analytics_service.py # Session aggregation, revenue reports, time-series queries
|   |
|   |-- models/                 # SQLAlchemy ORM models (database tables)
|   |   |-- __init__.py         # Exports all models for Alembic auto-generation
|   |   |-- base.py             # SQLAlchemy DeclarativeBase, common mixins (timestamps, ID)
|   |   |-- session.py          # Session model (kiosk session state, timestamps, analysis)
|   |   |-- payment.py          # Payment model (transaction ID, amount, status, provider)
|   |   |-- config.py           # Config model (key-value configuration with categories)
|   |   `-- device.py           # Device model (camera/printer status, capabilities)
|   |
|   |-- schemas/                # Pydantic schemas (request/response validation)
|   |   |-- __init__.py
|   |   |-- session.py          # SessionCreate, SessionResponse, SessionState
|   |   |-- payment.py          # PaymentCreate, PaymentResponse, WebhookPayload
|   |   |-- config.py           # ConfigResponse, ConfigUpdate, ConfigCategory
|   |   |-- camera.py           # CameraDevice, CameraStreamConfig
|   |   |-- ai.py               # AIAnalysisRequest, AIAnalysisResponse
|   |   |-- print.py            # PrintJobRequest, PrintStatusResponse
|   |   |-- admin.py            # AdminLoginRequest, AdminAuthToken, AnalyticsResponse
|   |   `-- common.py           # Shared schemas: ErrorResponse, PaginationParams, SuccessResponse
|   |
|   |-- core/                   # Core infrastructure (config, database, security, lifecycle)
|   |   |-- __init__.py
|   |   |-- config.py           # Settings class (Pydantic BaseSettings, loads from .env)
|   |   |-- database.py         # Async SQLAlchemy engine, session factory, Base metadata
|   |   |-- security.py         # PIN hashing, JWT token generation, signature verification
|   |   |-- exceptions.py       # Custom exception classes (NotFound, PaymentError, PrinterError)
|   |   |-- middleware.py       # CORS, request logging, error handling middleware
|   |   `-- lifecycle.py        # Application startup/shutdown events (printer init, camera init)
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
|   |   |-- test_kiosk_service.py
|   |   |-- test_camera_service.py
|   |   |-- test_ai_service.py
|   |   |-- test_payment_service.py
|   |   |-- test_print_service.py
|   |   |-- test_config_service.py
|   |   `-- test_utils/
|   |       |-- test_dithering.py
|   |       `-- test_escpos.py
|   |
|   `-- integration/            # Integration tests (real DB, mocked external services)
|       |-- __init__.py
|       |-- test_kiosk_endpoints.py
|       |-- test_payment_endpoints.py
|       |-- test_admin_endpoints.py
|       `-- test_camera_endpoints.py
|
|-- alembic/                    # Database migrations
|   |-- env.py                  # Alembic configuration (imports SQLAlchemy metadata)
|   |-- script.py.mako          # Migration script template
|   `-- versions/               # Generated migration files
|       |-- 0001_initial_schema.py
|       `-- 0002_add_payment_tables.py
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
from backend.app.services.kiosk_service import KioskService
from backend.app.api.deps import get_kiosk_service

router = APIRouter(prefix="/kiosk", tags=["kiosk"])

@router.post("/session", response_model=SessionResponse, status_code=201)
async def create_session(
    service: KioskService = Depends(get_kiosk_service),
) -> SessionResponse:
    session = await service.create_session()
    return SessionResponse.model_validate(session)
```

### Service File Convention

Each file in `backend/app/services/` contains one service class. Service classes are instantiated per-request via FastAPI's dependency injection. Services accept database sessions and other dependencies through their constructor, enabling easy mocking in tests.

```python
# backend/app/services/kiosk_service.py

from sqlalchemy.ext.asyncio import AsyncSession
from backend.app.models.session import Session
from backend.app.core.database import get_db_session

class KioskService:
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
|   |
|   |-- components/             # React components organized by domain
|   |   |-- kiosk/              # Public kiosk screen components
|   |   |   |-- IdleScreen.tsx          # Welcome screen with "Start" button
|   |   |   |-- PaymentScreen.tsx       # QRIS QR code display with countdown
|   |   |   |-- CaptureScreen.tsx       # Live camera preview with countdown overlay
|   |   |   |-- ProcessingScreen.tsx    # AI analysis loading animation
|   |   |   |-- RevealScreen.tsx        # Result display with print/share buttons
|   |   |   |-- ResetScreen.tsx         # Brief cleanup transition screen
|   |   |   |-- CameraPreview.tsx       # MJPEG stream renderer (img tag)
|   |   |   |-- CountdownOverlay.tsx    # 3-2-1 countdown animation
|   |   |   `-- KioskLayout.tsx         # Common layout wrapper for kiosk screens
|   |   |
|   |   |-- admin/              # Admin dashboard components
|   |   |   |-- AdminLayout.tsx          # Sidebar + content layout
|   |   |   |-- DashboardPage.tsx        # Overview with key metrics
|   |   |   |-- ConfigEditor.tsx         # Configuration form by category
|   |   |   |-- AnalyticsCharts.tsx      # Session and revenue charts
|   |   |   |-- HardwareStatus.tsx       # Camera + printer status display
|   |   |   |-- HardwareTestPanel.tsx    # Camera/printer test buttons
|   |   |   `-- SessionHistory.tsx       # Recent session table
|   |   |
|   |   `-- ui/                 # shadcn/ui base components (copy-paste pattern)
|   |       |-- button.tsx
|   |       |-- card.tsx
|   |       |-- dialog.tsx
|   |       |-- input.tsx
|   |       |-- label.tsx
|   |       |-- select.tsx
|   |       |-- table.tsx
|   |       |-- toast.tsx
|   |       |-- skeleton.tsx
|   |       `-- ...              # Other shadcn/ui components as needed
|   |
|   |-- hooks/                  # Custom React hooks
|   |   |-- useKioskState.ts    # Zustand store hook for kiosk state machine
|   |   |-- useSession.ts       # React Query hook for session API calls
|   |   |-- usePayment.ts       # React Query hook for payment status polling
|   |   |-- useCamera.ts        # Camera stream URL and device management
|   |   |-- usePrinter.ts       # Print job trigger and status polling
|   |   |-- useCountdown.ts     # Countdown timer hook (configurable duration)
|   |   `-- useMediaQuery.ts    # Responsive breakpoint detection (for admin dashboard)
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
|   |   `-- types.ts            # TypeScript type definitions matching backend Pydantic schemas
|   |
|   |-- pages/                  # Route-level page components
|   |   |-- KioskPage.tsx       # Route: / (public kiosk flow)
|   |   |-- AdminLoginPage.tsx  # Route: /admin/login
|   |   |-- AdminDashboardPage.tsx # Route: /admin
|   |   |-- AdminConfigPage.tsx # Route: /admin/config
|   |   |-- AdminAnalyticsPage.tsx # Route: /admin/analytics
|   |   `-- AdminHardwarePage.tsx # Route: /admin/hardware
|   |
|   |-- lib/                    # Frontend utilities
|   |   |-- utils.ts            # shadcn/ui utility functions (cn helper for className merging)
|   |   |-- constants.ts        # App-wide constants (API routes, timeouts, defaults)
|   |   `-- formatters.ts       # Display formatters (currency, date, duration)
|   |
|   `-- styles/                 # Global styles
|       |-- globals.css         # Tailwind CSS base styles and CSS custom properties
|       `-- animations.css      # Custom keyframe animations (for Framer Motion variants)
|
|   `-- __tests__/              # Frontend tests
|       |-- setup.ts            # Vitest global setup (jest-dom matchers)
|       |-- components/         # Component tests
|       |-- hooks/              # Hook tests
|       |-- stores/             # Store tests
|       `-- mocks/              # MSW handlers and mock data
|
|-- index.html                  # HTML entry point
|-- vite.config.ts              # Vite configuration (plugins, proxy, build)
|-- tailwind.config.ts          # Tailwind CSS configuration
|-- tsconfig.json               # TypeScript configuration
|-- tsconfig.node.json          # TypeScript configuration for Vite config files
|-- postcss.config.js           # PostCSS configuration (Tailwind, autoprefixer)
|-- package.json                # NPM dependencies and scripts
|-- package-lock.json           # NPM lock file
`-- eslint.config.js            # ESLint flat config
```

### Kiosk Component Organization

The kiosk flow is implemented as a set of screen components in `components/kiosk/`, each corresponding to one state in the kiosk state machine. The `KioskLayout` component wraps all screens and handles common concerns (fullscreen container, error boundary, touch event optimization).

The `KioskPage` component selects which screen to render based on the current state from the Zustand store:

```tsx
// frontend/src/pages/KioskPage.tsx

import { useKioskStore } from '@/stores/kioskStore';
import { IdleScreen } from '@/components/kiosk/IdleScreen';
import { PaymentScreen } from '@/components/kiosk/PaymentScreen';
import { CaptureScreen } from '@/components/kiosk/CaptureScreen';
import { ProcessingScreen } from '@/components/kiosk/ProcessingScreen';
import { RevealScreen } from '@/components/kiosk/RevealScreen';

export function KioskPage() {
  const state = useKioskStore((s) => s.currentState);

  return (
    <KioskLayout>
      {state === 'IDLE' && <IdleScreen />}
      {state === 'PAYMENT' && <PaymentScreen />}
      {state === 'CAPTURE' && <CaptureScreen />}
      {state === 'PROCESSING' && <ProcessingScreen />}
      {state === 'REVEAL' && <RevealScreen />}
      {state === 'RESET' && null}
    </KioskLayout>
  );
}
```

### Admin Component Organization

Admin components follow a page-based structure where each route in `/admin` renders a page component that composes smaller admin components from `components/admin/`. The `AdminLayout` provides the sidebar navigation and content area.

### shadcn/ui Component Management

Components in `components/ui/` are installed using the shadcn/ui CLI and are copied directly into the project (not installed as an npm dependency). This gives full control over styling and behavior. When updating shadcn/ui components, use `npx shadcn@latest add <component>` to re-import and merge changes.

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
|-- Dockerfile                  # Multi-stage production build
|                               # Stage 1: Build frontend (npm build)
|                               # Stage 2: Install Python deps, copy backend + built frontend
|
|-- Dockerfile.dev              # Development build
|                               # Single stage: Python deps + backend source (no frontend build)
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
|-- README.md                   # Project overview, features, quick start, screenshots
```

---

## 5. Naming Conventions

### Python (Backend)

| Element | Convention | Example |
|---------|-----------|---------|
| Files and directories | `snake_case` | `kiosk_service.py`, `ai_service.py` |
| Classes | `PascalCase` | `KioskService`, `AIProvider`, `SessionResponse` |
| Functions and methods | `snake_case` | `create_session()`, `analyze_image()` |
| Variables | `snake_case` | `session_id`, `printer_connection` |
| Constants | `UPPER_SNAKE_CASE` | `MAX_RETRIES`, `DEFAULT_TIMEOUT` |
| Private methods | Leading underscore | `_validate_transition()`, `_build_escpos_commands()` |
| Async functions | `snake_case` with `async` keyword | `async def create_session()` |
| Pydantic models | `PascalCase` with suffix | `SessionCreate`, `SessionResponse`, `ConfigUpdate` |
| SQLAlchemy models | `PascalCase` | `Session`, `Payment`, `DeviceConfig` |
| Test files | `test_` prefix | `test_kiosk_service.py` |
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
from backend.app.services.kiosk_service import KioskService
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
