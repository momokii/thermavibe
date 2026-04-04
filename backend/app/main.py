"""VibePrint OS - FastAPI application entry point."""

from fastapi import FastAPI

from app.api.v1.router import router as v1_router

app = FastAPI(
    title="VibePrint OS",
    description="Open-source AI-powered photobooth kiosk software",
    version="0.1.0",
)

app.include_router(v1_router)


@app.get("/health")
async def health_check() -> dict[str, str]:
    return {"status": "ok"}
