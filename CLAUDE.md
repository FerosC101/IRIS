# IRIS

Monorepo: `backend/` (FastAPI + SQLite, Python 3.11+, uv) and `frontend/` (React 19 + TypeScript + Vite). All demo data is synthetic.

## Commands

```bash
cd backend && uv run pytest                          # backend tests
cd backend && uv run uvicorn iris.main:app --port 8000
cd frontend && npm test                              # unit tests (vitest)
cd frontend && npm run typecheck
cd frontend && npm run build
cd frontend && npm run dev                           # http://localhost:5180, proxies /api to :8000
```

## Conventions

- The backend is the source of truth; the frontend holds no duplicated business logic or hard-coded data.
- Detector output is a "flag", never a "finding". Resolution requires human verification and attached evidence.
- A zero-case report is a report; a missing submission is not; a blank field is neither.
- Weeks are ISO weeks on a fixed simulated calendar (`backend/iris/config.py`). Times are PHT (UTC+8).
- Design decisions: `docs/IRIS_DESIGN_AUDIT.md`.
