# Personal Expense Tracker

A full-stack personal finance dashboard for tracking income and expenses, reviewing spending patterns, and setting monthly budgets. Data is stored in SQLite and isolated per authenticated user.

All currency values are displayed in Indian Rupees (INR) using Indian number grouping.

## Features

- Account registration, login, bcrypt password hashing, and expiring JWT access tokens.
- Dashboard with all-time income, expenses and balance, monthly spending, recent activity, and live charts.
- Create, edit, delete, search, filter, and sort income and expense transactions.
- Monthly budgets with progress tracking and overspending warnings.
- Responsive React interface and interactive API documentation through FastAPI Swagger UI.
- SQLite tables are initialized automatically at backend startup.

## Technologies

- Frontend: React 18, Vite, Tailwind CSS, Chart.js, lucide-react.
- Backend: Python, FastAPI, SQLAlchemy 2, PyJWT, Passlib/bcrypt.
- Database: SQLite.

## Project structure

```text
backend/
  auth.py
  database.py
  main.py
  models.py
  schemas.py
  requirements.txt
  tests/test_api.py
frontend/
  src/App.jsx
  src/context/AuthContext.jsx
  src/services/api.js
  src/index.css
  package.json
README.md
```

## Requirements

Python 3.9+ and Node.js 18+ with npm.

## Installation and startup

Open two terminals from the project root.

### Backend (Terminal 1)

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn main:app --reload
```

For production, set `SECRET_KEY` in `backend/.env` to a long, random value. The local development fallback should not be used in a deployed environment.

### Frontend (Terminal 2)

```bash
cd frontend
npm install
npm run dev
```

Optionally copy `frontend/.env.example` to `frontend/.env` to change the API URL. Its default is `http://localhost:8000/api`.

## Local URLs

- Web application: http://localhost:5173
- Backend: http://localhost:8000
- Swagger UI / API documentation: http://localhost:8000/docs
- Health check: http://localhost:8000/api/health

## Database and API

The backend creates `backend/expense_tracker.db` automatically by default. Override the location with `DATABASE_URL`. API endpoints are prefixed with `/api`; authenticated routes accept `Authorization: Bearer <token>`. CORS origins can be configured with the comma-separated `CORS_ORIGINS` environment variable.

## Tests

From `backend/` with the virtual environment active:

```bash
pytest -q
```
