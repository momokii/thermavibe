# =============================================================================
# Stage 1: Build frontend static assets
# =============================================================================
FROM node:20-alpine AS frontend-build

WORKDIR /frontend

COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# =============================================================================
# Stage 2: Backend runtime + static frontend serving
# =============================================================================
FROM python:3.12-slim AS backend-runtime

# System dependencies for USB printer (libusb), camera (v4l), and image processing
RUN apt-get update && apt-get install -y --no-install-recommends \
    libusb-1.0-0 \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY backend/pyproject.toml ./
RUN pip install --no-cache-dir .

# Copy backend application code
COPY backend/ ./

# Copy frontend build output into static files directory
COPY --from=frontend-build /frontend/dist ./static

# Expose the application port
EXPOSE 8000

# Run the FastAPI application
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
