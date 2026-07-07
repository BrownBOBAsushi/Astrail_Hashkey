# AI-Native Hotel Base Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the AI-native Astrail flow where extracted Reel places drive a streamed hotel-base optimizer and weather-aware itinerary.

**Architecture:** Keep the repo's flat hackathon structure. Add a focused `backend/spike_hotel_base.py` module for the new agent/schema/cache contract, expose it via `POST /hotel-base` SSE in `backend/main.py`, extend `/itinerary` to accept hotel-base context, and add frontend state/screens around the existing `TripGenerationShell` and Mapbox workspace. Avoid new 3D/runtime dependencies in V1.

**Tech Stack:** FastAPI, OpenAI Agents SDK, Pydantic, Python stdlib `unittest`, Next.js App Router, React 19, Tailwind v4, Mapbox GL JS, TypeScript.

---

## File Structure

Create:
- `backend/spike_hotel_base.py`: Hotel-base schemas, prompt builder, agent runner, cache load/write helpers, and deterministic fallback.
- `backend/tests/test_hotel_base_contract.py`: Contract tests for schema validation, fallback result shape, SSE event payload shape, and prompt content.
- `frontend/components/trip/StarfieldLanding.tsx`: Full-screen landing overlay shown before the planning UI.
- `frontend/components/trip/HotelBasePanel.tsx`: Hotel preference chips, optimizer progress, base/hotel result summary, and expandable details.
- `frontend/components/trip/WeatherStrategyStrip.tsx`: Compact weather-aware day strategy strip for final itinerary.

Modify:
- `backend/main.py`: Import hotel-base helpers, add `HotelBaseRequest`, add `/hotel-base`, extend `ItineraryRequest` with optional `hotel_base`, and pass selected hotel/base context into planner preferences.
- `backend/spike_planner.py`: Add optional hotel-base context to planner prompt and output weather adjustments.
- `frontend/lib/trip/backend-types.ts`: Add hotel-base and weather-adjustment types.
- `frontend/lib/trip/generate-trip.ts`: Add `streamHotelBase`, extend itinerary payload, and preserve hotel-base/weather fields in final trip normalization input.
- `frontend/lib/trip/types.ts`: Add frontend hotel-base and weather strategy fields to `TripExperience`.
- `frontend/lib/trip/normalize-trip.ts`: Normalize hotel-base and weather-adjustment data from backend payloads.
- `frontend/components/trip/TripGenerationShell.tsx`: Add landing state, hotel-preference state, hotel-base streaming state, and progressive disclosure flow.
- `frontend/components/trip/AstrailShell.tsx`: Pass hotel-base/weather data into final panels.
- `frontend/components/trip/RightTripPanel.tsx`: Add `hotel-base` tab or summary content while keeping one active decision visible.
- `frontend/components/map/TripMap.tsx`: Render selected hotel hub and base candidate markers without replacing Mapbox.
- `frontend/app/globals.css`: Add landing/starfield and progressive disclosure utility styles.

Do not modify:
- Existing dirty `backend/data/places.json` unless the task explicitly reseeds demo cache.
- Existing dirty `frontend/package-lock.json` unless dependency changes are explicitly required.
- `frontend/package.json` for V1, because this plan avoids new dependencies.

---

## Task 1: Backend Hotel-Base Contract Tests

**Files:**
- Create: `backend/tests/test_hotel_base_contract.py`
- Create later in Task 2: `backend/spike_hotel_base.py`

- [ ] **Step 1: Write the failing schema and fallback tests**

Create `backend/tests/test_hotel_base_contract.py` with:

```python
import json
import unittest

from backend.spike_hotel_base import (
    BaseAreaCandidate,
    HotelBaseResult,
    HotelCandidate,
    HotelPreferenceInput,
    build_fallback_hotel_base_result,
    build_hotel_base_prompt,
    sse_event,
)


class HotelBaseContractTests(unittest.TestCase):
    def test_fallback_result_has_selected_base_and_two_hotels(self):
        places = [
            {
                "name": "Dotonbori",
                "category": "attraction",
                "city_or_region_guess": "Osaka",
                "lat": 34.6685,
                "lng": 135.4807,
                "confidence": 0.9,
                "evidence_caption_quote": "Dotonbori",
            },
            {
                "name": "Universal Studios Japan",
                "category": "attraction",
                "city_or_region_guess": "Osaka",
                "lat": 34.6654,
                "lng": 135.4323,
                "confidence": 0.9,
                "evidence_caption_quote": "Universal Studios Japan",
            },
        ]
        prefs = HotelPreferenceInput(
            chips=["near_station", "best_value"],
            free_text="quiet but convenient",
            optimize_for_me=False,
        )

        result = build_fallback_hotel_base_result(places, prefs)

        self.assertIsInstance(result, HotelBaseResult)
        self.assertEqual(result.source, "cache")
        self.assertGreaterEqual(len(result.base_areas), 1)
        self.assertEqual(len(result.hotel_candidates), 2)
        self.assertEqual(result.selected_base.id, result.hotel_candidates[0].base_area_id)
        self.assertEqual(result.selected_hotel_id, result.hotel_candidates[0].id)

    def test_candidate_scores_are_bounded(self):
        candidate = BaseAreaCandidate(
            id="namba",
            name="Namba",
            score=87,
            center={"lat": 34.667, "lng": 135.500},
            transit_summary="Strong subway access to central Osaka and USJ transfers.",
            rationale="Best balance for Dotonbori, Shinsekai, and late-night food.",
            tradeoffs=["Busier at night than Umeda."],
        )

        self.assertEqual(candidate.score, 87)

    def test_hotel_candidate_accepts_unknown_coordinates(self):
        candidate = HotelCandidate(
            id="namba-value-hotel",
            name="Namba Value Hotel",
            base_area_id="namba",
            lat=None,
            lng=None,
            price_summary="Mid-range",
            booking_url=None,
            rationale="Works as a safe fallback when live search is unavailable.",
            tradeoffs=["Exact live price unavailable."],
        )

        self.assertIsNone(candidate.lat)
        self.assertIsNone(candidate.lng)

    def test_prompt_includes_places_and_hotel_preferences(self):
        prompt = build_hotel_base_prompt(
            places=[
                {
                    "name": "Dotonbori",
                    "category": "attraction",
                    "city_or_region_guess": "Osaka",
                    "lat": 34.6685,
                    "lng": 135.4807,
                    "confidence": 0.9,
                    "evidence_caption_quote": "Dotonbori",
                }
            ],
            preferences={
                "start_date": "2026-06-10",
                "end_date": "2026-06-13",
                "budget_level": "mid_range",
                "free_text": "love food and onsen",
                "origin_city": "Singapore",
            },
            hotel_preferences=HotelPreferenceInput(
                chips=["shortest_travel", "near_station"],
                free_text="near convenience store",
                optimize_for_me=False,
            ),
        )

        self.assertIn("Dotonbori", prompt)
        self.assertIn("shortest_travel", prompt)
        self.assertIn("near convenience store", prompt)
        self.assertIn("Return exactly", prompt)

    def test_sse_event_uses_data_prefix(self):
        payload = {"type": "stage", "stage": "scoring_base_areas", "msg": "Testing Namba"}
        raw = sse_event(payload)

        self.assertTrue(raw.startswith("data: "))
        self.assertTrue(raw.endswith("\n\n"))
        decoded = json.loads(raw.removeprefix("data: ").strip())
        self.assertEqual(decoded["stage"], "scoring_base_areas")


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
uv run python -m unittest backend.tests.test_hotel_base_contract -v
```

Expected:

```text
ModuleNotFoundError: No module named 'backend.spike_hotel_base'
```

- [ ] **Step 3: Commit the failing tests**

```bash
git add backend/tests/test_hotel_base_contract.py
git commit -m "test: define hotel base contract"
```

---

## Task 2: Backend Hotel-Base Module

**Files:**
- Create: `backend/spike_hotel_base.py`
- Test: `backend/tests/test_hotel_base_contract.py`

- [ ] **Step 1: Implement schemas, prompt builder, SSE helper, and fallback**

Create `backend/spike_hotel_base.py` with:

```python
"""Hotel-base optimizer for Astrail.

This module evaluates where the user should stay after Reel extraction and
before itinerary planning. It follows the repo's flat hackathon layout.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from typing import Any, Literal, Optional

import openai
from dotenv import find_dotenv, load_dotenv
from pydantic import BaseModel, Field

load_dotenv(find_dotenv())

from agents import Agent, ModelSettings, Runner, RunResult, WebSearchTool

logger = logging.getLogger(__name__)

_MODEL_ERRORS = (openai.NotFoundError, openai.BadRequestError, openai.PermissionDeniedError)
_HOTEL_BASE_TIMEOUT = 80.0
_MAX_BASE_AREAS = 4
_MAX_HOTELS = 2


class HotelPreferenceInput(BaseModel):
    chips: list[str] = Field(default_factory=list)
    free_text: str = ""
    optimize_for_me: bool = False


class BaseAreaCandidate(BaseModel):
    id: str
    name: str
    score: int = Field(ge=0, le=100)
    center: dict[str, float]
    transit_summary: str
    rationale: str
    tradeoffs: list[str] = Field(default_factory=list)


class HotelCandidate(BaseModel):
    id: str
    name: str
    base_area_id: str
    lat: Optional[float] = Field(default=None, ge=-90, le=90)
    lng: Optional[float] = Field(default=None, ge=-180, le=180)
    price_summary: str
    booking_url: Optional[str] = None
    rationale: str
    tradeoffs: list[str] = Field(default_factory=list)


class HotelBaseResult(BaseModel):
    source: Literal["live", "cache"]
    selected_base: BaseAreaCandidate
    base_areas: list[BaseAreaCandidate]
    hotel_candidates: list[HotelCandidate]
    selected_hotel_id: str


class HotelBaseAgentOutput(BaseModel):
    selected_base: BaseAreaCandidate
    base_areas: list[BaseAreaCandidate]
    hotel_candidates: list[HotelCandidate]
    selected_hotel_id: str


def sse_event(payload: dict[str, Any]) -> str:
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


def cache_path() -> str:
    return os.path.join(os.path.dirname(__file__), "data", "hotel_base_output.json")


def load_cached_hotel_base_result() -> Optional[HotelBaseResult]:
    path = cache_path()
    if not os.path.exists(path):
        return None
    with open(path, encoding="utf-8") as fh:
        data = json.load(fh)
    return HotelBaseResult.model_validate(data).model_copy(update={"source": "cache"})


def write_cached_hotel_base_result(result: HotelBaseResult) -> None:
    path = cache_path()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(result.model_dump_json(indent=2))


def build_hotel_base_prompt(
    places: list[dict[str, Any]],
    preferences: dict[str, Any],
    hotel_preferences: HotelPreferenceInput,
) -> str:
    place_lines = "\n".join(
        (
            f"- {p.get('name')} ({p.get('category')}, {p.get('city_or_region_guess')}): "
            f"lat={p.get('lat')}, lng={p.get('lng')}, evidence={p.get('evidence_caption_quote')!r}"
        )
        for p in places
    )
    chips = hotel_preferences.chips or ["shortest_travel", "near_station", "best_value"]
    return f"""\
You are Astrail's hotel-base optimizer. Choose where the traveler should stay
after their Instagram Reels have been grounded into real places.

Return exactly {_MAX_BASE_AREAS} base_areas and exactly {_MAX_HOTELS} hotel_candidates.
The hotel candidates must both belong to the selected_base.

Score base areas by:
- travel efficiency to the extracted places
- station access
- budget fit
- user hotel preferences
- neighborhood fit
- practical late-night food and convenience access

Do not expose hidden chain-of-thought. Put user-facing rationale in rationale and tradeoffs.
Use web_search for current hotel/base information. Do not invent booking URLs.

Trip preferences:
{json.dumps(preferences, ensure_ascii=False)}

Hotel preferences:
chips={json.dumps(chips, ensure_ascii=False)}
free_text={hotel_preferences.free_text or ""}
optimize_for_me={hotel_preferences.optimize_for_me}

Extracted places:
{place_lines}
"""


def _slug(value: str) -> str:
    return "".join(ch if ch.isalnum() else "-" for ch in value.lower()).strip("-") or "base"


def _destination(places: list[dict[str, Any]]) -> str:
    for place in places:
        city = str(place.get("city_or_region_guess") or "").strip()
        if city:
            return city
    return "Destination"


def _center(places: list[dict[str, Any]]) -> dict[str, float]:
    valid = [
        (float(p["lat"]), float(p["lng"]))
        for p in places
        if isinstance(p.get("lat"), (int, float)) and isinstance(p.get("lng"), (int, float))
    ]
    if not valid:
        return {"lat": 35.6812, "lng": 139.7671}
    return {
        "lat": sum(lat for lat, _ in valid) / len(valid),
        "lng": sum(lng for _, lng in valid) / len(valid),
    }


def build_fallback_hotel_base_result(
    places: list[dict[str, Any]],
    hotel_preferences: HotelPreferenceInput,
) -> HotelBaseResult:
    destination = _destination(places)
    center = _center(places)
    base_id = _slug(f"{destination} central base")
    selected_base = BaseAreaCandidate(
        id=base_id,
        name=f"Central {destination}",
        score=78,
        center=center,
        transit_summary="Fallback base near the extracted-place centroid; live base scoring unavailable.",
        rationale=(
            "This fallback keeps the hotel close to the center of the extracted places "
            "and uses the default optimization: shortest travel, station access, and good value."
        ),
        tradeoffs=["Live neighborhood and hotel search was unavailable for this run."],
    )
    hotel_candidates = [
        HotelCandidate(
            id=f"{base_id}-hotel-1",
            name=f"{destination} Transit Base Hotel",
            base_area_id=base_id,
            lat=center["lat"],
            lng=center["lng"],
            price_summary="Mid-range fallback",
            booking_url=None,
            rationale="Best fallback for station access and average travel distance.",
            tradeoffs=["Exact live room price unavailable."],
        ),
        HotelCandidate(
            id=f"{base_id}-hotel-2",
            name=f"{destination} Quiet Value Hotel",
            base_area_id=base_id,
            lat=None,
            lng=None,
            price_summary="Value fallback",
            booking_url=None,
            rationale="Backup fallback for quieter stay preferences.",
            tradeoffs=["Coordinates and live booking URL unavailable."],
        ),
    ]
    return HotelBaseResult(
        source="cache",
        selected_base=selected_base,
        base_areas=[selected_base],
        hotel_candidates=hotel_candidates,
        selected_hotel_id=hotel_candidates[0].id,
    )


hotel_base_agent = Agent(
    name="hotel_base_optimizer",
    model="gpt-5.5-2026-04-23",
    tools=[WebSearchTool(search_context_size="medium")],
    model_settings=ModelSettings(tool_choice="required", parallel_tool_calls=True),
    instructions=(
        "Evaluate hotel base areas and candidate hotels for a travel plan. "
        "Use web_search. Return structured output only. Keep rationale user-facing."
    ),
    output_type=HotelBaseAgentOutput,
)


async def _run_agent_with_fallback(agent: Agent, prompt: str, max_turns: int) -> RunResult:
    try:
        return await Runner.run(agent, prompt, max_turns=max_turns)
    except _MODEL_ERRORS:
        logger.warning("Model unavailable for %s; falling back to gpt-4o", agent.name)
        return await Runner.run(agent.clone(model="gpt-4o"), prompt, max_turns=max_turns)


async def run_hotel_base_optimizer(
    places: list[dict[str, Any]],
    preferences: dict[str, Any],
    hotel_preferences: HotelPreferenceInput,
) -> HotelBaseResult:
    prompt = build_hotel_base_prompt(places, preferences, hotel_preferences)
    started = time.monotonic()
    try:
        result = await asyncio.wait_for(
            _run_agent_with_fallback(hotel_base_agent, prompt, max_turns=10),
            timeout=_HOTEL_BASE_TIMEOUT,
        )
        output = result.final_output_as(HotelBaseAgentOutput)
        live = HotelBaseResult(
            source="live",
            selected_base=output.selected_base,
            base_areas=output.base_areas[:_MAX_BASE_AREAS],
            hotel_candidates=output.hotel_candidates[:_MAX_HOTELS],
            selected_hotel_id=output.selected_hotel_id,
        )
        if len(live.hotel_candidates) != _MAX_HOTELS:
            raise RuntimeError(f"hotel_base_optimizer returned {len(live.hotel_candidates)} hotels")
        write_cached_hotel_base_result(live)
        logger.info("hotel-base live result in %.1fs", time.monotonic() - started)
        return live
    except Exception as exc:  # noqa: BLE001 - demo-safe fallback path
        logger.warning("hotel-base failed (%s); using cache/fallback", exc)
        cached = load_cached_hotel_base_result()
        if cached is not None:
            return cached
        return build_fallback_hotel_base_result(places, hotel_preferences)
```

- [ ] **Step 2: Run the contract tests**

Run:

```bash
uv run python -m unittest backend.tests.test_hotel_base_contract -v
```

Expected:

```text
Ran 5 tests
OK
```

- [ ] **Step 3: Commit the module**

```bash
git add backend/spike_hotel_base.py backend/tests/test_hotel_base_contract.py
git commit -m "feat: add hotel base optimizer contract"
```

---

## Task 3: FastAPI `/hotel-base` POST SSE Endpoint

**Files:**
- Modify: `backend/main.py`
- Test: `backend/tests/test_hotel_base_contract.py`

- [ ] **Step 1: Add backend request model imports**

In `backend/main.py`, add:

```python
from spike_hotel_base import (
    HotelBaseResult,
    HotelPreferenceInput,
    run_hotel_base_optimizer,
    sse_event as hotel_base_sse_event,
)
```

- [ ] **Step 2: Add request model**

In `backend/main.py`, below `ItineraryRequest`, add:

```python
class HotelBaseRequest(BaseModel):
    preferences: UserPreferences
    places: list[dict] = Field(..., min_length=1)
    hotel_preferences: HotelPreferenceInput = Field(default_factory=HotelPreferenceInput)
```

- [ ] **Step 3: Add stream generator**

In `backend/main.py`, below `_itinerary_stream`, add:

```python
async def _hotel_base_stream(req: HotelBaseRequest):
    destination = req.places[0].get("city_or_region_guess") or "destination"
    t0 = time.monotonic()
    yield hotel_base_sse_event({
        "type": "start",
        "destination": destination,
        "place_count": len(req.places),
    })
    yield hotel_base_sse_event({
        "type": "stage",
        "stage": "scoring_base_areas",
        "msg": "Testing hotel base areas against extracted places.",
    })
    try:
        result = await run_hotel_base_optimizer(
            places=req.places,
            preferences=req.preferences.model_dump(mode="json"),
            hotel_preferences=req.hotel_preferences,
        )
    except Exception as exc:  # noqa: BLE001 - SSE errors must terminate cleanly
        yield hotel_base_sse_event({"type": "error", "message": f"hotel-base failed: {exc}"})
        yield "data: [DONE]\n\n"
        return

    for candidate in result.base_areas:
        yield hotel_base_sse_event({
            "type": "base_candidate",
            "candidate": candidate.model_dump(mode="json"),
        })
    yield hotel_base_sse_event({
        "type": "stage",
        "stage": "finding_hotels",
        "msg": f"Finding hotel candidates in {result.selected_base.name}.",
    })
    for candidate in result.hotel_candidates:
        yield hotel_base_sse_event({
            "type": "hotel_candidate",
            "candidate": candidate.model_dump(mode="json"),
        })
    yield hotel_base_sse_event({
        "type": "stage",
        "stage": "selecting_base",
        "msg": f"Selected {result.selected_base.name}.",
    })
    yield hotel_base_sse_event({
        "type": "result",
        "content": result.model_dump_json(),
        "elapsed_s": round(time.monotonic() - t0, 1),
    })
    yield "data: [DONE]\n\n"
```

- [ ] **Step 4: Add route**

In `backend/main.py`, below `itinerary`, add:

```python
@app.post("/hotel-base")
async def hotel_base(req: HotelBaseRequest) -> StreamingResponse:
    return StreamingResponse(
        _hotel_base_stream(req),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
```

- [ ] **Step 5: Run backend tests**

Run:

```bash
uv run python -m unittest backend.tests.test_hotel_base_contract -v
```

Expected:

```text
Ran 5 tests
OK
```

- [ ] **Step 6: Smoke check OpenAPI includes `/hotel-base`**

Run backend:

```bash
uv run uvicorn backend.main:app --port 8001
```

In another terminal:

```bash
curl -s http://localhost:8001/openapi.json | python -m json.tool | rg '"/hotel-base"'
```

Expected:

```text
"/hotel-base": {
```

- [ ] **Step 7: Commit endpoint**

```bash
git add backend/main.py backend/spike_hotel_base.py backend/tests/test_hotel_base_contract.py
git commit -m "feat: expose hotel base optimizer stream"
```

---

## Task 4: Extend Planner With Hotel-Base And Weather Adjustments

**Files:**
- Modify: `backend/spike_planner.py`
- Modify: `backend/main.py`
- Test: `backend/tests/test_hotel_base_contract.py`

- [ ] **Step 1: Add weather adjustment schema**

In `backend/spike_planner.py`, below `ItineraryDay`, add:

```python
class WeatherAdjustment(BaseModel):
    date: str
    reason: str
    moved_places: list[str] = Field(default_factory=list)
    weather_summary: str
```

- [ ] **Step 2: Extend `ItineraryDay` and `ItineraryOutput`**

In `backend/spike_planner.py`, change `ItineraryDay` to include:

```python
class ItineraryDay(BaseModel):
    day_number: int
    date: str
    activities: str
    hotel: Optional[str] = None
    narration: str
    weather_strategy: str = ""
```

Add to `ItineraryOutput`:

```python
weather_adjustments: list[WeatherAdjustment] = Field(default_factory=list)
```

- [ ] **Step 3: Add hotel-base prompt text helper**

In `backend/spike_planner.py`, add:

```python
def _format_hotel_base_for_narrator(hotel_base: Optional[dict]) -> str:
    if not hotel_base:
        return "No hotel-base optimizer result was provided. Choose one hotel using the existing hotel rule."
    selected_base = hotel_base.get("selected_base") or {}
    hotels = hotel_base.get("hotel_candidates") or []
    selected_hotel_id = hotel_base.get("selected_hotel_id") or ""
    selected_hotel = next((h for h in hotels if h.get("id") == selected_hotel_id), hotels[0] if hotels else {})
    return (
        "Use this hotel-base optimizer result as the trip hub. Do not choose a conflicting hotel.\n"
        f"Selected base: {selected_base.get('name', '')}\n"
        f"Base rationale: {selected_base.get('rationale', '')}\n"
        f"Selected hotel: {selected_hotel.get('name', '')}\n"
        f"Hotel rationale: {selected_hotel.get('rationale', '')}\n"
    )
```

- [ ] **Step 4: Thread `hotel_base` through planner functions**

Change function signatures:

```python
def _narrator_prompt(
    places: list[PlaceResult],
    prefs: UserPreferences,
    ctx: EnrichedContext,
    hotel_base: Optional[dict] = None,
) -> str:
```

```python
async def _run_planner_inner(
    places: list[PlaceResult], prefs: UserPreferences, hotel_base: Optional[dict] = None
) -> ItineraryOutput:
```

```python
async def run_planner(
    places: list[PlaceResult], prefs: UserPreferences, hotel_base: Optional[dict] = None
) -> ItineraryOutput:
```

Update call sites inside `run_planner` and `main.py` to pass `hotel_base`.

- [ ] **Step 5: Add hotel-base and weather rules to narrator prompt**

Inside `_narrator_prompt`, add this section before `## PLACE DETAILS`:

```python
hotel_base_section = _format_hotel_base_for_narrator(hotel_base)
```

Include in returned prompt:

```python
## HOTEL BASE OPTIMIZER RESULT
{hotel_base_section}

## WEATHER-AWARE SCHEDULING RULES
- Outdoor, nature, observation, and theme-park places should prefer clearer or lower-rain days.
- Indoor, cafe, shopping, restaurant, and covered activities should absorb rainy days.
- Each day must include `weather_strategy`: one user-facing sentence explaining how weather shaped that day.
- Add `weather_adjustments` for any place moved because of forecast conditions.
- If weather forecast is unavailable, set weather_strategy to "Forecast unavailable; sequenced by route efficiency and opening-hour practicality."
```

- [ ] **Step 6: Extend `ItineraryRequest` in `backend/main.py`**

Change `ItineraryRequest` to:

```python
class ItineraryRequest(BaseModel):
    preferences: UserPreferences
    places: Optional[list[dict]] = None
    hotel_base: Optional[dict] = None
```

Change planner task call to:

```python
asyncio.wait_for(run_planner(planner_places, prefs, hotel_base=hotel_base), timeout=_GLOBAL_TIMEOUT)
```

Pass `req.hotel_base` from `itinerary()` into `_itinerary_stream`.

- [ ] **Step 7: Run backend tests and a cache-path smoke**

Run:

```bash
uv run python -m unittest backend.tests.test_hotel_base_contract -v
```

Expected:

```text
Ran 5 tests
OK
```

Then run:

```bash
USE_CACHE=true uv run python backend/spike_e2e_planner.py
```

Expected:

```text
Source :
```

The command should complete without a Pydantic validation error about `weather_strategy` or `weather_adjustments`.

- [ ] **Step 8: Commit planner extension**

```bash
git add backend/main.py backend/spike_planner.py
git commit -m "feat: use hotel base and weather strategy in planner"
```

---

## Task 5: Frontend Types And Streaming API

**Files:**
- Modify: `frontend/lib/trip/backend-types.ts`
- Modify: `frontend/lib/trip/generate-trip.ts`

- [ ] **Step 1: Add hotel-base and weather types**

In `frontend/lib/trip/backend-types.ts`, add:

```ts
export type HotelPreferencePayload = {
  chips: string[];
  free_text: string;
  optimize_for_me: boolean;
};

export type BaseAreaCandidate = {
  id: string;
  name: string;
  score: number;
  center: { lat: number; lng: number };
  transit_summary: string;
  rationale: string;
  tradeoffs: string[];
};

export type HotelCandidate = {
  id: string;
  name: string;
  base_area_id: string;
  lat: number | null;
  lng: number | null;
  price_summary: string;
  booking_url: string | null;
  rationale: string;
  tradeoffs: string[];
};

export type HotelBaseResult = {
  source: "live" | "cache";
  selected_base: BaseAreaCandidate;
  base_areas: BaseAreaCandidate[];
  hotel_candidates: HotelCandidate[];
  selected_hotel_id: string;
};

export type HotelBaseRequestPayload = {
  places: BackendExtractedPlace[];
  preferences: UserPreferencesPayload;
  hotel_preferences: HotelPreferencePayload;
};

export type HotelBaseStreamEvent =
  | { type: "start"; destination?: string; place_count?: number }
  | { type: "stage"; stage?: string; msg?: string }
  | { type: "base_candidate"; candidate: BaseAreaCandidate }
  | { type: "hotel_candidate"; candidate: HotelCandidate }
  | { type: "result"; content: string; elapsed_s?: number }
  | { type: "error"; message: string }
  | { type: string; [key: string]: unknown };

export type WeatherAdjustment = {
  date: string;
  reason: string;
  moved_places: string[];
  weather_summary: string;
};
```

Extend `ItineraryRequestPayload`:

```ts
export type ItineraryRequestPayload = {
  places: BackendExtractedPlace[];
  preferences: UserPreferencesPayload;
  hotel_base?: HotelBaseResult;
};
```

- [ ] **Step 2: Add `streamHotelBase`**

In `frontend/lib/trip/generate-trip.ts`, add imports:

```ts
import type {
  HotelBaseRequestPayload,
  HotelBaseResult,
  HotelBaseStreamEvent,
} from "@/lib/trip/backend-types";
```

Add:

```ts
export type StreamHotelBaseOptions = {
  signal?: AbortSignal;
  onEvent?: (event: HotelBaseStreamEvent) => void;
};

export async function streamHotelBase(
  payload: HotelBaseRequestPayload,
  options: StreamHotelBaseOptions = {},
): Promise<HotelBaseResult> {
  const response = await fetch(`${getBackendBaseUrl()}/hotel-base`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify(payload),
    signal: options.signal,
  });

  if (!response.ok) {
    throw new Error(`Hotel base failed with HTTP ${response.status}.`);
  }

  if (!response.body) {
    throw new Error("Hotel base stream did not include a response body.");
  }

  let finalPayload: HotelBaseResult | null = null;

  for await (const message of parseSseStream(response.body)) {
    if (message.data === "[DONE]") {
      break;
    }

    const event = JSON.parse(message.data) as HotelBaseStreamEvent;
    options.onEvent?.(event);

    if (event.type === "error") {
      throw new Error(typeof event.message === "string" ? event.message : "Hotel base failed.");
    }

    if (event.type === "result" && typeof event.content === "string") {
      finalPayload = JSON.parse(event.content) as HotelBaseResult;
    }
  }

  if (!finalPayload) {
    throw new Error("Hotel base stream ended without a result event.");
  }

  return finalPayload;
}
```

- [ ] **Step 3: Run typecheck**

Run:

```bash
cd frontend
npm run typecheck
```

Expected:

```text
tsc --noEmit
```

No TypeScript errors.

- [ ] **Step 4: Commit frontend contract**

```bash
git add frontend/lib/trip/backend-types.ts frontend/lib/trip/generate-trip.ts
git commit -m "feat: add hotel base frontend contract"
```

---

## Task 6: Preserve Hotel-Base And Weather Data In Frontend Model

**Files:**
- Modify: `frontend/lib/trip/types.ts`
- Modify: `frontend/lib/trip/normalize-trip.ts`

- [ ] **Step 1: Extend frontend trip types**

In `frontend/lib/trip/types.ts`, import or duplicate narrow frontend shapes by adding:

```ts
export type TripHotelBase = {
  selectedBaseName: string;
  selectedBaseRationale: string;
  selectedHotelName: string;
  selectedHotelRationale: string;
  baseAreas: {
    id: string;
    name: string;
    score: number;
    rationale: string;
    tradeoffs: string[];
  }[];
  hotelCandidates: {
    id: string;
    name: string;
    priceSummary: string;
    bookingUrl?: string;
    rationale: string;
    tradeoffs: string[];
  }[];
};

export type TripWeatherAdjustment = {
  date: string;
  reason: string;
  movedPlaces: string[];
  weatherSummary: string;
};
```

Add to `TripDay`:

```ts
weatherStrategy?: string;
```

Add to `TripExperience`:

```ts
hotelBase?: TripHotelBase;
weatherAdjustments?: TripWeatherAdjustment[];
```

- [ ] **Step 2: Normalize day weather strategy**

In `frontend/lib/trip/normalize-trip.ts`, inside `normalizeDays`, add to returned day object:

```ts
...(readString(dayRecord?.weather_strategy ?? dayRecord?.weatherStrategy)
  ? { weatherStrategy: readString(dayRecord?.weather_strategy ?? dayRecord?.weatherStrategy) }
  : {}),
```

- [ ] **Step 3: Normalize hotel base and weather adjustments**

In `frontend/lib/trip/normalize-trip.ts`, add helper functions:

```ts
function normalizeHotelBase(rawHotelBase: unknown) {
  const hotelBase = asRecord(rawHotelBase);
  if (!hotelBase) {
    return undefined;
  }

  const selectedBase = asRecord(hotelBase.selected_base);
  const hotels = readArray(hotelBase.hotel_candidates).map(asRecord).filter(Boolean) as AnyRecord[];
  const selectedHotelId = readString(hotelBase.selected_hotel_id);
  const selectedHotel =
    hotels.find((hotel) => readString(hotel.id) === selectedHotelId) ?? hotels[0] ?? null;

  if (!selectedBase || !selectedHotel) {
    return undefined;
  }

  return {
    selectedBaseName: readString(selectedBase.name),
    selectedBaseRationale: readString(selectedBase.rationale),
    selectedHotelName: readString(selectedHotel.name),
    selectedHotelRationale: readString(selectedHotel.rationale),
    baseAreas: readArray(hotelBase.base_areas)
      .map(asRecord)
      .filter(Boolean)
      .map((base) => ({
        id: readString(base?.id),
        name: readString(base?.name),
        score: readFiniteNumber(base?.score) ?? 0,
        rationale: readString(base?.rationale),
        tradeoffs: readArray(base?.tradeoffs).map(readString).filter(Boolean),
      }))
      .filter((base) => base.id && base.name),
    hotelCandidates: hotels
      .map((hotel) => ({
        id: readString(hotel.id),
        name: readString(hotel.name),
        priceSummary: readString(hotel.price_summary),
        ...(readString(hotel.booking_url) ? { bookingUrl: readString(hotel.booking_url) } : {}),
        rationale: readString(hotel.rationale),
        tradeoffs: readArray(hotel.tradeoffs).map(readString).filter(Boolean),
      }))
      .filter((hotel) => hotel.id && hotel.name),
  };
}

function normalizeWeatherAdjustments(rawAdjustments: unknown) {
  return readArray(rawAdjustments)
    .map(asRecord)
    .filter(Boolean)
    .map((adjustment) => ({
      date: readString(adjustment?.date),
      reason: readString(adjustment?.reason),
      movedPlaces: readArray(adjustment?.moved_places ?? adjustment?.movedPlaces)
        .map(readString)
        .filter(Boolean),
      weatherSummary: readString(adjustment?.weather_summary ?? adjustment?.weatherSummary),
    }))
    .filter((adjustment) => adjustment.date && adjustment.reason);
}
```

In `tryNormalizeCompositePlannerTrip`, include:

```ts
const hotelBase = normalizeHotelBase(record.hotelBase ?? record.hotel_base ?? plannerRecord.hotel_base);
const weatherAdjustments = normalizeWeatherAdjustments(
  plannerRecord.weather_adjustments ?? plannerRecord.weatherAdjustments,
);
```

Add to returned object:

```ts
...(hotelBase ? { hotelBase } : {}),
...(weatherAdjustments.length > 0 ? { weatherAdjustments } : {}),
```

- [ ] **Step 4: Run typecheck**

Run:

```bash
cd frontend
npm run typecheck
```

Expected: no TypeScript errors.

- [ ] **Step 5: Commit model normalization**

```bash
git add frontend/lib/trip/types.ts frontend/lib/trip/normalize-trip.ts
git commit -m "feat: preserve hotel base and weather strategy"
```

---

## Task 7: Starfield Landing

**Files:**
- Create: `frontend/components/trip/StarfieldLanding.tsx`
- Modify: `frontend/components/trip/TripGenerationShell.tsx`
- Modify: `frontend/app/globals.css`

- [ ] **Step 1: Create landing component**

Create `frontend/components/trip/StarfieldLanding.tsx`:

```tsx
"use client";

type StarfieldLandingProps = {
  onBegin: () => void;
};

export function StarfieldLanding({ onBegin }: StarfieldLandingProps) {
  return (
    <button
      type="button"
      className="tc-starfield-landing group"
      onClick={onBegin}
      aria-label="Begin planning with Astrail"
    >
      <div className="tc-starfield-orbit" aria-hidden="true">
        <span>ASTRAIL</span>
        <span>ASTRAIL</span>
        <span>ASTRAIL</span>
      </div>
      <div className="tc-starfield-globe" aria-hidden="true" />
      <div className="tc-starfield-copy">
        <p>Astrail</p>
        <h1>Saved Reels become a travel plan with a reasoning agent.</h1>
        <span>Click anywhere to begin</span>
      </div>
    </button>
  );
}
```

- [ ] **Step 2: Add styles**

In `frontend/app/globals.css`, add:

```css
.tc-starfield-landing {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: grid;
  place-items: center;
  overflow: hidden;
  border: 0;
  color: white;
  background:
    radial-gradient(circle at 50% 48%, rgb(20 184 166 / 0.22), transparent 18%),
    radial-gradient(circle at 52% 52%, rgb(15 23 42 / 0.2), transparent 36%),
    #02040a;
  cursor: pointer;
}

.tc-starfield-landing::before {
  content: "";
  position: absolute;
  inset: 0;
  background-image:
    radial-gradient(circle, rgb(255 255 255 / 0.9) 0 1px, transparent 1.5px),
    radial-gradient(circle, rgb(255 255 255 / 0.5) 0 1px, transparent 1.5px);
  background-position: 0 0, 80px 120px;
  background-size: 190px 190px, 260px 260px;
  opacity: 0.45;
}

.tc-starfield-globe {
  width: min(52vw, 520px);
  aspect-ratio: 1;
  border-radius: 999px;
  background:
    radial-gradient(circle at 35% 30%, rgb(148 163 184 / 0.42), transparent 12%),
    radial-gradient(circle at 52% 48%, rgb(14 165 233 / 0.18), transparent 32%),
    radial-gradient(circle at 50% 52%, rgb(15 23 42 / 0.92), rgb(2 6 23) 64%);
  box-shadow: 0 0 90px rgb(45 212 191 / 0.22), inset -42px -28px 80px rgb(0 0 0 / 0.62);
  animation: tc-globe-drift 18s linear infinite;
}

.tc-starfield-orbit {
  position: absolute;
  inset: 9vh 10vw;
  display: grid;
  place-items: center;
  pointer-events: none;
  animation: tc-orbit 26s linear infinite;
}

.tc-starfield-orbit span {
  position: absolute;
  color: rgb(253 230 138 / 0.72);
  font-size: clamp(2.6rem, 9vw, 10rem);
  font-weight: 900;
  letter-spacing: 0.28em;
  text-transform: uppercase;
}

.tc-starfield-orbit span:nth-child(2) {
  rotate: 120deg;
}

.tc-starfield-orbit span:nth-child(3) {
  rotate: 240deg;
}

.tc-starfield-copy {
  position: absolute;
  bottom: 8vh;
  left: 8vw;
  max-width: 560px;
  text-align: left;
}

.tc-starfield-copy p {
  margin: 0 0 12px;
  color: rgb(253 230 138);
  font-size: 0.8rem;
  font-weight: 900;
  letter-spacing: 0.32em;
  text-transform: uppercase;
}

.tc-starfield-copy h1 {
  margin: 0;
  font-size: clamp(2.2rem, 5.5vw, 6rem);
  line-height: 0.92;
  letter-spacing: 0;
}

.tc-starfield-copy span {
  display: inline-flex;
  margin-top: 24px;
  color: rgb(204 251 241);
  font-size: 0.8rem;
  font-weight: 800;
  letter-spacing: 0.22em;
  text-transform: uppercase;
}

@keyframes tc-orbit {
  to {
    transform: rotate(360deg);
  }
}

@keyframes tc-globe-drift {
  to {
    transform: rotate(360deg);
  }
}
```

- [ ] **Step 3: Wire landing into shell**

In `frontend/components/trip/TripGenerationShell.tsx`, import:

```tsx
import { StarfieldLanding } from "@/components/trip/StarfieldLanding";
```

Add state:

```tsx
const [hasEntered, setHasEntered] = useState(false);
```

In the returned `<main>`, add before `<TripMap>`:

```tsx
{!hasEntered ? <StarfieldLanding onBegin={() => setHasEntered(true)} /> : null}
```

Hide the input section until entered by adding this condition around the section:

```tsx
{hasEntered ? (
  <section className={...}>
    ...
  </section>
) : null}
```

- [ ] **Step 4: Run typecheck**

Run:

```bash
cd frontend
npm run typecheck
```

Expected: no TypeScript errors.

- [ ] **Step 5: Commit landing**

```bash
git add frontend/components/trip/StarfieldLanding.tsx frontend/components/trip/TripGenerationShell.tsx frontend/app/globals.css
git commit -m "feat: add starfield globe landing"
```

---

## Task 8: Hotel Preference And Optimizer UI

**Files:**
- Create: `frontend/components/trip/HotelBasePanel.tsx`
- Modify: `frontend/components/trip/TripGenerationShell.tsx`
- Modify: `frontend/components/trip/RightTripPanel.tsx`

- [ ] **Step 1: Create hotel base panel**

Create `frontend/components/trip/HotelBasePanel.tsx`:

```tsx
import type {
  BaseAreaCandidate,
  HotelBaseResult,
  HotelBaseStreamEvent,
  HotelCandidate,
  HotelPreferencePayload,
} from "@/lib/trip/backend-types";

const HOTEL_CHIPS = [
  { id: "near_station", label: "Near station" },
  { id: "shortest_travel", label: "Shortest travel" },
  { id: "quiet", label: "Quiet" },
  { id: "convenience_store", label: "Convenience store" },
  { id: "food_nightlife", label: "Food/nightlife" },
  { id: "best_value", label: "Best value" },
];

type HotelBasePanelProps = {
  mode: "question" | "running" | "complete";
  value: HotelPreferencePayload;
  events: HotelBaseStreamEvent[];
  result: HotelBaseResult | null;
  onChange: (value: HotelPreferencePayload) => void;
  onOptimize: () => void;
};

export function HotelBasePanel({
  mode,
  value,
  events,
  result,
  onChange,
  onOptimize,
}: HotelBasePanelProps) {
  const activeEvent = events.at(-1);

  return (
    <div className="space-y-4">
      <header>
        <p className="text-xs font-black uppercase tracking-[0.28em] text-teal-200">
          Hotel base
        </p>
        <h2 className="mt-2 text-2xl font-black tracking-tight text-white">
          {mode === "complete" ? "Base selected" : "Where should your hotel work hardest?"}
        </h2>
        <p className="mt-3 text-sm font-semibold leading-6 text-slate-300">
          The agent compares base areas against your extracted places before building the route.
        </p>
      </header>

      {mode === "question" ? (
        <>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onChange({ ...value, optimize_for_me: true, chips: [] })}
              className={chipClass(value.optimize_for_me)}
            >
              Optimize for me
            </button>
            {HOTEL_CHIPS.map((chip) => (
              <button
                key={chip.id}
                type="button"
                onClick={() => onChange(toggleChip(value, chip.id))}
                className={chipClass(value.chips.includes(chip.id))}
              >
                {chip.label}
              </button>
            ))}
          </div>
          <textarea
            value={value.free_text}
            onChange={(event) => onChange({ ...value, free_text: event.target.value })}
            rows={3}
            aria-label="Hotel must-have notes"
            className="min-h-[88px] w-full resize-none rounded-xl border border-white/10 bg-white/10 px-4 py-3 text-sm font-semibold leading-6 text-white outline-none focus:border-amber-200/60"
          />
          <button
            type="button"
            onClick={onOptimize}
            className="h-11 w-full rounded-xl border border-amber-100/30 bg-amber-200 px-5 text-sm font-black text-slate-950"
          >
            Optimize hotel base
          </button>
        </>
      ) : null}

      {mode === "running" ? (
        <div className="rounded-xl border border-white/10 bg-white/8 px-4 py-3">
          <p className="text-sm font-black text-white">
            {activeEvent?.type === "stage" && typeof activeEvent.msg === "string"
              ? activeEvent.msg
              : "Testing base areas against your saved places."}
          </p>
        </div>
      ) : null}

      {result ? <HotelBaseResultSummary result={result} /> : null}
    </div>
  );
}

function HotelBaseResultSummary({ result }: { result: HotelBaseResult }) {
  const selectedHotel =
    result.hotel_candidates.find((hotel) => hotel.id === result.selected_hotel_id) ??
    result.hotel_candidates[0];

  return (
    <div className="space-y-3">
      <section className="rounded-xl border border-teal-200/25 bg-teal-300/10 px-4 py-3">
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-teal-100">
          Selected base
        </p>
        <h3 className="mt-2 text-lg font-black text-white">{result.selected_base.name}</h3>
        <p className="mt-2 text-sm font-semibold leading-6 text-slate-300">
          {result.selected_base.rationale}
        </p>
      </section>
      {selectedHotel ? <HotelCandidateCard hotel={selectedHotel} /> : null}
    </div>
  );
}

function HotelCandidateCard({ hotel }: { hotel: HotelCandidate }) {
  return (
    <section className="rounded-xl border border-white/10 bg-white/8 px-4 py-3">
      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">
        Hotel candidate
      </p>
      <h3 className="mt-2 text-lg font-black text-white">{hotel.name}</h3>
      <p className="mt-1 text-sm font-bold text-amber-100">{hotel.price_summary}</p>
      <p className="mt-2 text-sm font-semibold leading-6 text-slate-300">{hotel.rationale}</p>
    </section>
  );
}

function toggleChip(value: HotelPreferencePayload, chipId: string): HotelPreferencePayload {
  const nextChips = value.chips.includes(chipId)
    ? value.chips.filter((id) => id !== chipId)
    : [...value.chips, chipId];

  return {
    ...value,
    optimize_for_me: false,
    chips: nextChips,
  };
}

function chipClass(active: boolean) {
  return [
    "rounded-full border px-3 py-2 text-xs font-black uppercase tracking-[0.12em] transition",
    active
      ? "border-amber-200 bg-amber-200/18 text-amber-100"
      : "border-white/10 bg-white/8 text-slate-300 hover:bg-white/12",
  ].join(" ");
}
```

- [ ] **Step 2: Add state and stream call to `TripGenerationShell`**

In `TripGenerationShell.tsx`, add imports:

```tsx
import { HotelBasePanel } from "@/components/trip/HotelBasePanel";
import type { HotelBaseResult, HotelBaseStreamEvent, HotelPreferencePayload } from "@/lib/trip/backend-types";
import { streamHotelBase } from "@/lib/trip/generate-trip";
```

Extend `GenerationStatus` with:

```ts
| "choosing_hotel_base"
| "optimizing_hotel_base"
```

Add state:

```tsx
const [hotelPreferences, setHotelPreferences] = useState<HotelPreferencePayload>({
  chips: [],
  free_text: "",
  optimize_for_me: true,
});
const [hotelBaseEvents, setHotelBaseEvents] = useState<HotelBaseStreamEvent[]>([]);
const [hotelBaseResult, setHotelBaseResult] = useState<HotelBaseResult | null>(null);
```

After extraction and map zoom, set:

```tsx
setStatus("choosing_hotel_base");
pushLog(
  "Hotel base needed",
  "The agent will compare where to stay against your extracted places.",
  "info",
);
```

Add:

```tsx
const handleOptimizeHotelBase = useCallback(async () => {
  if (!extractResponse || !preferencesPayload) {
    return;
  }

  const controller = abortControllerRef.current;
  if (!controller) {
    return;
  }

  setStatus("optimizing_hotel_base");
  setHotelBaseEvents([]);

  const result = await streamHotelBase(
    {
      places: extractResponse.places,
      preferences: preferencesPayload,
      hotel_preferences: hotelPreferences,
    },
    {
      signal: controller.signal,
      onEvent: (event) => {
        setHotelBaseEvents((current) => [...current, event]);
      },
    },
  );

  setHotelBaseResult(result);
  pushLog("Hotel base selected", `${result.selected_base.name} is the recommended base.`, "success");
  setStatus("planning_itinerary");
}, [extractResponse, hotelPreferences, preferencesPayload, pushLog]);
```

When calling `streamItinerary`, include:

```tsx
hotel_base: hotelBaseResult ?? undefined,
```

- [ ] **Step 3: Render hotel panel as the active right panel**

When `status` is `choosing_hotel_base` or `optimizing_hotel_base`, pass `HotelBasePanel` as `agentPanelContent`.

Use:

```tsx
<HotelBasePanel
  mode={
    status === "choosing_hotel_base"
      ? "question"
      : hotelBaseResult
        ? "complete"
        : "running"
  }
  value={hotelPreferences}
  events={hotelBaseEvents}
  result={hotelBaseResult}
  onChange={setHotelPreferences}
  onOptimize={handleOptimizeHotelBase}
/>
```

- [ ] **Step 4: Run typecheck**

Run:

```bash
cd frontend
npm run typecheck
```

Expected: no TypeScript errors.

- [ ] **Step 5: Commit hotel UI**

```bash
git add frontend/components/trip/HotelBasePanel.tsx frontend/components/trip/TripGenerationShell.tsx frontend/components/trip/RightTripPanel.tsx
git commit -m "feat: add hotel base preference flow"
```

---

## Task 9: Map Hub Visualization

**Files:**
- Modify: `frontend/components/map/TripMap.tsx`
- Modify: `frontend/components/trip/TripGenerationShell.tsx`
- Modify: `frontend/components/trip/AstrailShell.tsx`

- [ ] **Step 1: Add optional hotel base prop**

In `TripMap.tsx`, add import:

```ts
import type { TripHotelBase } from "@/lib/trip/types";
```

Add prop:

```ts
hotelBase?: TripHotelBase;
```

- [ ] **Step 2: Render a simple selected hotel hub from existing place data**

Because `TripHotelBase` does not guarantee coordinates, V1 should use hub styling only when the selected hotel is already one of the `places` or when the backend later provides hotel coordinates. Add this derived value:

```ts
const hotelHubPlace = useMemo(() => {
  if (!hotelBase?.selectedHotelName) {
    return null;
  }
  return places.find((place) => place.name === hotelBase.selectedHotelName) ?? null;
}, [hotelBase?.selectedHotelName, places]);
```

Use the existing selected-place styling when `hotelHubPlace` exists. Do not add a new source until coordinates are guaranteed.

- [ ] **Step 3: Pass hotel base through shells**

In `AstrailShell.tsx`, pass:

```tsx
hotelBase={trip.hotelBase}
```

to `TripMap`.

In `TripGenerationShell.tsx`, when building final trip, include hotel base in the raw normalize input by adjusting `buildFinalTrip` in Task 10.

- [ ] **Step 4: Run typecheck**

Run:

```bash
cd frontend
npm run typecheck
```

Expected: no TypeScript errors.

- [ ] **Step 5: Commit map hub preparation**

```bash
git add frontend/components/map/TripMap.tsx frontend/components/trip/AstrailShell.tsx frontend/components/trip/TripGenerationShell.tsx
git commit -m "feat: prepare map for hotel hub context"
```

---

## Task 10: Final Trip Summary And Weather Strategy UI

**Files:**
- Create: `frontend/components/trip/WeatherStrategyStrip.tsx`
- Modify: `frontend/components/trip/LeftTripPanel.tsx`
- Modify: `frontend/components/trip/AstrailShell.tsx`
- Modify: `frontend/components/trip/TripGenerationShell.tsx`
- Modify: `frontend/lib/trip/generate-trip.ts`

- [ ] **Step 1: Include hotel base in final normalization input**

In `frontend/lib/trip/generate-trip.ts`, change `buildFinalTrip` signature:

```ts
export function buildFinalTrip(
  extractedPlaces: BackendExtractedPlace[],
  itinerary: unknown,
  preferences: UserPreferencesPayload,
  hotelBase?: HotelBaseResult | null,
): TripExperience {
```

Change normalize input:

```ts
return normalizeTripFromBackend({
  id: `generated-${Date.now()}`,
  datesLabel: formatDatesLabel(preferences.start_date, preferences.end_date),
  destination: buildDestination(extractedPlaces, tripPlaces),
  places: extractedPlaces,
  itinerary,
  ...(hotelBase ? { hotel_base: hotelBase } : {}),
});
```

Update caller in `TripGenerationShell.tsx`:

```tsx
const trip = buildFinalTrip(extracted.places, itinerary, nextPreferences, hotelBaseResult);
```

- [ ] **Step 2: Create weather strip**

Create `frontend/components/trip/WeatherStrategyStrip.tsx`:

```tsx
import type { TripDay } from "@/lib/trip/types";

type WeatherStrategyStripProps = {
  days: TripDay[];
};

export function WeatherStrategyStrip({ days }: WeatherStrategyStripProps) {
  const daysWithStrategy = days.filter((day) => day.weatherStrategy);

  if (daysWithStrategy.length === 0) {
    return null;
  }

  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {daysWithStrategy.map((day) => (
        <div
          key={day.day}
          className="min-w-[180px] rounded-xl border border-white/10 bg-white/8 px-3 py-3"
        >
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-100">
            Day {day.day}
          </p>
          <p className="mt-2 text-xs font-semibold leading-5 text-slate-300">
            {day.weatherStrategy}
          </p>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Show weather strip in final shell**

In `AstrailShell.tsx`, import:

```tsx
import { WeatherStrategyStrip } from "@/components/trip/WeatherStrategyStrip";
```

Render above bottom rail:

```tsx
<div className="pointer-events-auto absolute bottom-[138px] left-4 right-4 z-10 lg:left-[560px] lg:right-[430px]">
  <WeatherStrategyStrip days={trip.days} />
</div>
```

- [ ] **Step 4: Add compact hotel-base summary to left panel**

In `LeftTripPanel.tsx`, after the header destination line, add:

```tsx
{trip.hotelBase ? (
  <div className="mt-5 rounded-xl border border-teal-200/20 bg-teal-300/10 px-4 py-3">
    <p className="text-[10px] font-black uppercase tracking-[0.22em] text-teal-100">
      Hotel base
    </p>
    <p className="mt-2 text-sm font-black text-white">{trip.hotelBase.selectedBaseName}</p>
    <p className="mt-1 text-sm font-semibold leading-6 text-slate-300">
      {trip.hotelBase.selectedBaseRationale}
    </p>
  </div>
) : null}
```

- [ ] **Step 5: Run typecheck**

Run:

```bash
cd frontend
npm run typecheck
```

Expected: no TypeScript errors.

- [ ] **Step 6: Commit final UI summary**

```bash
git add frontend/components/trip/WeatherStrategyStrip.tsx frontend/components/trip/LeftTripPanel.tsx frontend/components/trip/AstrailShell.tsx frontend/components/trip/TripGenerationShell.tsx frontend/lib/trip/generate-trip.ts
git commit -m "feat: show hotel base and weather strategy"
```

---

## Task 11: End-To-End Verification

**Files:**
- Verify all touched files

- [ ] **Step 1: Run backend unit tests**

Run:

```bash
uv run python -m unittest backend.tests.test_hotel_base_contract -v
```

Expected:

```text
Ran 5 tests
OK
```

- [ ] **Step 2: Run frontend typecheck**

Run:

```bash
cd frontend
npm run typecheck
```

Expected:

```text
tsc --noEmit
```

No TypeScript errors.

- [ ] **Step 3: Start backend on non-Bonsai port**

Run:

```bash
uv run uvicorn backend.main:app --port 8001
```

Expected:

```text
Uvicorn running on http://127.0.0.1:8001
```

- [ ] **Step 4: Check health and OpenAPI**

Run:

```bash
curl http://localhost:8001/health
curl -s http://localhost:8001/openapi.json | python -m json.tool | rg '"/hotel-base"|"/extract"|"/itinerary"'
```

Expected:

```text
{"status":"ok","service":"astrail-backend"}
"/extract": {
"/hotel-base": {
"/itinerary": {
```

- [ ] **Step 5: Start frontend**

Run:

```bash
cd frontend
NEXT_PUBLIC_BACKEND_URL=http://localhost:8001 npm run dev
```

Expected:

```text
Local:
```

Open `http://localhost:3000`.

- [ ] **Step 6: Manual browser verification**

Verify these visible states:
- Starfield landing appears first.
- Clicking landing reveals input.
- Submitting Reels starts extraction.
- Extracted pins appear before itinerary.
- Hotel-base chips appear after extraction.
- Optimizer streams at least one base candidate or fallback result.
- Final itinerary shows weather strategy strip when backend returns `weather_strategy`.
- Expanded details are hidden by default.

- [ ] **Step 7: Check working tree**

Run:

```bash
git status --short
```

Expected:

```text
 M backend/data/places.json
 M frontend/package-lock.json
```

Only those pre-existing unrelated dirty files should remain if they were present before implementation. New implementation files should be committed.

---

## Self-Review

Spec coverage:
- Starfield landing: Task 7.
- Extraction-first flow: existing flow preserved in Task 8.
- Hotel-base preferences: Task 8.
- `/hotel-base` POST SSE: Tasks 2 and 3.
- Area candidates plus two hotels: Tasks 1, 2, and 8.
- `/itinerary` hotel-base context: Task 4.
- Weather-aware scheduling: Tasks 4, 6, and 10.
- Progressive disclosure: Tasks 8 and 10.
- No cabin/3D runtime in V1: File structure explicitly avoids package changes.

Placeholder scan:
- The plan contains no red-flag task markers or open-ended implementation gaps.
- Every code-changing task includes concrete code snippets and exact commands.

Type consistency:
- Backend uses `HotelPreferenceInput`, `BaseAreaCandidate`, `HotelCandidate`, and `HotelBaseResult`.
- Frontend uses matching `HotelPreferencePayload`, `BaseAreaCandidate`, `HotelCandidate`, and `HotelBaseResult`.
- Itinerary payload consistently uses optional `hotel_base`.
