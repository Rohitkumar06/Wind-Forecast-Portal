# Wind Forecast Intelligence — Full Stack SWE Challenge

A pilot dashboard for evaluating UK national wind generation forecasts against actual wind output for January 2026. Built with React + Vite, Python + FastAPI, and Docker Compose.

> **Important methodology note:** The challenge says decisions are made one day before delivery, but does not specify the exact trading decision time. This app makes the assumption explicit and configurable: for each delivery day it selects the latest forecast published before the chosen cutoff on the previous day (default 12:00 UK time). Confirm the cutoff with the trading team before using the results for operational decisions.

## Features

- Elexon FUELHH actual generation and WINDFOR forecast data.
- National wind generation comparison at 30-minute intervals.
- Latest eligible forecast chosen by publication time relative to a day-ahead cutoff.
- MAE, WAPE, mean forecast bias, and matched-interval coverage.
- Time-series charts, forecast publication log, date filters, CSV export.
- Clearly labelled synthetic demo mode for UI exploration if API access is unavailable.
- Docker Compose local environment.

## Project structure

```text
wind-forecast-portal/
├── backend/
│   ├── app/main.py          # FastAPI endpoints, Elexon client, matching and metrics
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/main.jsx         # Dashboard UI and chart components
│   ├── src/styles.css       # Responsive styling
│   ├── package.json
│   └── index.html
├── docker-compose.yml
└── README.md
```

## Run with Docker

Requires Docker Desktop / Docker Engine with Compose.

```bash
docker compose up --build
```

Then open:

- Frontend: http://localhost:5173
- Backend health: http://localhost:8000/api/health
- API docs: http://localhost:8000/docs

To stop: `Ctrl+C`, then `docker compose down`.

## Run without Docker

### Backend

Python 3.11+ recommended.

```bash
cd backend
python -m venv .venv
# macOS/Linux
source .venv/bin/activate
# Windows PowerShell: .venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Frontend

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. The frontend uses `http://localhost:8000` by default; override with `VITE_API_URL` if needed.

## API endpoints

- `GET /api/health`
- `GET /api/analysis?start=2026-01-01&end=2026-02-01&decision_hour=12`
- `GET /api/analysis?start=2026-01-01&end=2026-02-01&decision_hour=12&demo=true`

The end date is exclusive. Requests are limited to 35 days at a time.

## Metrics

- **MAE (MW):** mean of `abs(forecast - actual)` across matched intervals.
- **WAPE (%):** sum of absolute errors divided by sum of actual generation, multiplied by 100.
- **Mean bias (MW):** mean of `forecast - actual`; positive values mean over-forecasting.
- **Coverage (%):** matched forecast/actual intervals divided by requested intervals.

Missing data is kept as missing and excluded from error metrics; it is not silently imputed.

## Data sources

- Elexon FUELHH dataset stream: `https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/FUELHH/stream`
- Elexon WINDFOR dataset stream: `https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/WINDFOR/stream`
- API base: `https://data.elexon.co.uk/bmrs/api/v1`

The Elexon API is public and does not require an API key. The backend expects the fields `fuelType`, `startTime`, and `generation` for FUELHH, and `startTime`, `publishTime`, and `generation` for WINDFOR. Please verify the live response shape and dataset coverage before submission, because provider responses and historical availability can change.

## Deployment

The app is prepared for container-based deployment. The challenge asks for Vercel or Heroku:

- **Frontend:** deploy `frontend/` to Vercel and set `VITE_API_URL` to the public backend URL.
- **Backend:** deploy the `backend/` Dockerfile to a compatible host (or Heroku container stack) and set `CORS_ORIGINS` to the deployed frontend origin.
- Configure frontend/backend URLs and test `/api/health` plus `/api/analysis` from an incognito browser before submission.

No live deployment URL is included because deployment requires access to your hosting account. Do not claim the app is deployed until you deploy and verify it.

## AI tool disclosure

AI assistance (ChatGPT) was used to scaffold and draft portions of the application, documentation, and styling. Review, test, and understand the code before submitting it as your own work.

## Known limitations / next steps

1. Confirm the decision cutoff with the customer and align it with the actual day-ahead trading workflow.
2. Validate Elexon query semantics and historical forecast coverage for January 2026 end-to-end.
3. Add automated tests around timezone boundaries, publication-time selection, missing records, and metric calculations.
4. Add caching and pagination / background ingestion for larger date windows.
5. Configure production CORS, HTTPS, monitoring, and deployment environment variables.
