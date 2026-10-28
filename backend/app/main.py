from __future__ import annotations

import asyncio
import math
import os
from datetime import date, datetime, time, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo

import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

API_BASE = os.getenv("ELEXON_API_BASE", "https://data.elexon.co.uk/bmrs/api/v1")
UK = ZoneInfo("Europe/London")
app = FastAPI(title="Wind Forecast Accuracy API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def parse_dt(value: Any) -> datetime | None:
    if not value or not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    except ValueError:
        return None


def records(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [x for x in payload if isinstance(x, dict)]
    if isinstance(payload, dict):
        for key in ("data", "results", "records"):
            if isinstance(payload.get(key), list):
                return [x for x in payload[key] if isinstance(x, dict)]
    return []


async def fetch_dataset(client: httpx.AsyncClient, dataset: str, start: datetime, end: datetime) -> list[dict[str, Any]]:
    url = f"{API_BASE}/datasets/{dataset}/stream"
    params = {"from": start.isoformat().replace("+00:00", "Z"), "to": end.isoformat().replace("+00:00", "Z")}
    response = await client.get(url, params=params, timeout=35)
    response.raise_for_status()
    return records(response.json())


def num(value: Any) -> float | None:
    try:
        if value is None or value == "":
            return None
        result = float(value)
        return result if math.isfinite(result) else None
    except (ValueError, TypeError):
        return None


def normalise_actual(rows: list[dict[str, Any]]) -> dict[str, float]:
    output: dict[str, float] = {}
    for row in rows:
        fuel = str(row.get("fuelType", row.get("fueltype", ""))).upper()
        if fuel != "WIND":
            continue
        start = parse_dt(row.get("startTime"))
        generation = num(row.get("generation"))
        if start and generation is not None:
            output[start.isoformat()] = generation
    return output


def normalise_forecasts(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    output = []
    for row in rows:
        start = parse_dt(row.get("startTime"))
        publish = parse_dt(row.get("publishTime"))
        generation = num(row.get("generation"))
        if start and publish and generation is not None:
            output.append({"start": start, "publish": publish, "generation": generation})
    return output


def demo_data(start_date: date, end_date: date, decision_hour: int) -> dict[str, Any]:
    points = []
    day = start_date
    while day < end_date:
        cutoff = datetime.combine(day - timedelta(days=1), time(decision_hour, 0), UK).astimezone(timezone.utc)
        for period in range(48):
            target = datetime.combine(day, time.min, UK) + timedelta(minutes=30 * period)
            target_utc = target.astimezone(timezone.utc)
            phase = (period / 48) * 2 * math.pi
            actual = max(500, 8500 + 3000 * math.sin(phase - 0.9) + 1300 * math.sin(phase * 2 + day.day / 4))
            forecast = max(400, actual * (0.90 + 0.12 * math.sin(period / 5 + day.day)))
            points.append({
                "startTime": target_utc.isoformat().replace("+00:00", "Z"),
                "actualGeneration": round(actual, 1),
                "forecastGeneration": round(forecast, 1),
                "publishTime": cutoff.isoformat().replace("+00:00", "Z"),
                "decisionCutoff": cutoff.isoformat().replace("+00:00", "Z"),
                "absoluteError": round(abs(forecast - actual), 1),
                "signedError": round(forecast - actual, 1),
                "isMatched": True,
            })
        day += timedelta(days=1)
    return build_response(points, "demo", start_date, end_date, decision_hour, "Synthetic demo data — not Elexon observations.")


def build_response(points: list[dict[str, Any]], mode: str, start_date: date, end_date: date, decision_hour: int, note: str | None = None) -> dict[str, Any]:
    matched = [p for p in points if p.get("actualGeneration") is not None and p.get("forecastGeneration") is not None]
    errors = [abs(p["forecastGeneration"] - p["actualGeneration"]) for p in matched]
    signed = [p["forecastGeneration"] - p["actualGeneration"] for p in matched]
    mae = sum(errors) / len(errors) if errors else None
    actual_total = sum(p["actualGeneration"] for p in matched)
    wape = (sum(errors) / actual_total * 100) if actual_total else None
    return {
        "period": {"from": start_date.isoformat(), "toExclusive": end_date.isoformat()},
        "mode": mode,
        "note": note,
        "decisionRule": f"For each delivery day, use the latest forecast published before 12:{'00' if decision_hour == 12 else f'{decision_hour:02d}'} UK time on the previous day.",
        "metrics": {
            "intervals": len(points), "matchedIntervals": len(matched),
            "maeMw": round(mae, 2) if mae is not None else None,
            "wapePercent": round(wape, 2) if wape is not None else None,
            "meanBiasMw": round(sum(signed) / len(signed), 2) if signed else None,
            "forecastCoveragePercent": round(len(matched) / len(points) * 100, 1) if points else 0,
        },
        "points": points,
    }


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "wind-forecast-accuracy"}


@app.get("/api/analysis")
async def analysis(
    start: date = Query(default=date(2026, 1, 1)),
    end: date = Query(default=date(2026, 2, 1), description="Exclusive end date"),
    decision_hour: int = Query(default=12, ge=0, le=23),
    demo: bool = Query(default=False),
) -> dict[str, Any]:
    if end <= start:
        raise HTTPException(status_code=400, detail="end must be later than start")
    if (end - start).days > 35:
        raise HTTPException(status_code=400, detail="Please request 35 days or fewer at a time")
    if demo:
        return demo_data(start, end, decision_hour)

    start_uk = datetime.combine(start, time.min, UK)
    end_uk = datetime.combine(end, time.min, UK)
    # Include the previous day so the API has the publication history needed for the day-ahead cutoff.
    query_start = (start_uk - timedelta(days=1)).astimezone(timezone.utc)
    query_end = end_uk.astimezone(timezone.utc)
    try:
        async with httpx.AsyncClient(headers={"Accept": "application/json"}) as client:
            actual_rows, forecast_rows = await asyncio.gather(
                fetch_dataset(client, "FUELHH", query_start, query_end),
                fetch_dataset(client, "WINDFOR", query_start, query_end),
            )
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(status_code=502, detail=f"Could not retrieve Elexon data: {exc}. Try Demo mode to explore the dashboard.") from exc

    actuals = normalise_actual(actual_rows)
    forecasts = normalise_forecasts(forecast_rows)
    by_target: dict[str, list[dict[str, Any]]] = {}
    for forecast in forecasts:
        key = forecast["start"].isoformat()
        by_target.setdefault(key, []).append(forecast)

    points = []
    day = start
    while day < end:
        cutoff = datetime.combine(day - timedelta(days=1), time(decision_hour, 0), UK).astimezone(timezone.utc)
        for period in range(48):
            target = (datetime.combine(day, time.min, UK) + timedelta(minutes=period * 30)).astimezone(timezone.utc)
            key = target.isoformat()
            candidates = [f for f in by_target.get(key, []) if f["publish"] <= cutoff]
            chosen = max(candidates, key=lambda f: f["publish"]) if candidates else None
            actual = actuals.get(key)
            forecast_value = chosen["generation"] if chosen else None
            points.append({
                "startTime": target.isoformat().replace("+00:00", "Z"),
                "actualGeneration": round(actual, 1) if actual is not None else None,
                "forecastGeneration": round(forecast_value, 1) if forecast_value is not None else None,
                "publishTime": chosen["publish"].isoformat().replace("+00:00", "Z") if chosen else None,
                "decisionCutoff": cutoff.isoformat().replace("+00:00", "Z"),
                "absoluteError": round(abs(forecast_value - actual), 1) if forecast_value is not None and actual is not None else None,
                "signedError": round(forecast_value - actual, 1) if forecast_value is not None and actual is not None else None,
                "isMatched": forecast_value is not None and actual is not None,
            })
        day += timedelta(days=1)

    return build_response(points, "live", start, end, decision_hour, None)
