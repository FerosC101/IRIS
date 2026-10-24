"""FastAPI application entry point."""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from iris.api import analytics, concerns, data, interventions, meta, real
from iris.data.seed import ensure_seeded


@asynccontextmanager
async def lifespan(app: FastAPI):
    ensure_seeded()
    yield


app = FastAPI(title="IRIS API", version="0.1.0", lifespan=lifespan,
              description="Integrated Reporting Intervention System — research prototype. Demo workflow data is simulated; /api/real serves model outputs on real HDX/DOH dengue data.")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5180", "http://127.0.0.1:5180"], allow_methods=["*"], allow_headers=["*"])

for r in (meta.router, concerns.router, data.router, interventions.router, analytics.router, real.router):
    app.include_router(r, prefix="/api")


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


@app.exception_handler(ValueError)
async def value_error(_: Request, exc: ValueError) -> JSONResponse:
    return JSONResponse(status_code=422, content={"detail": str(exc)})
