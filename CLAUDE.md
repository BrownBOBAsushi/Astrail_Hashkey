# TripCanvas — Claude Code Project Instructions

## What we are building

AI-native travel planner. User pastes 3-4 Instagram Reel URLs + travel dates + budget + origin city + free-text preferences. Backend extracts real places, researches them live, fetches weather, generates demo-safe booking confirmations, and assembles a day-by-day itinerary. Frontend renders a Mapbox 3D globe → zoom-in city map → streaming AI agent panel.

Hackathon: Sea × OpenAI Codex Hackathon, 6 June 2026, Singapore.
Code freeze: 17:00 SGT. One tight demo loop beats three half-built features.

---

## Team Roles

| Person | Owns |
|--------|------|
| Shaun  | Extract pipeline (`spike_e2e.py`), planner + weather + booking agents (`spike_planner.py`, `spike_weather.py`, `spike_booking.py`), FastAPI SSE (`main.py`), demo reliability |
| Zhi Hao | Mapbox 3D frontend: `TripGenerationShell`, `TripMap`, `RightTripPanel`, `PlaceIntelPanel` |
| Cody  | Weather + booking agent code + Pydantic schemas (collab w/ Shaun on planner integration) |

---

## Exact Stack — do not substitute

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15 (App Router) + React 19 + Tailwind v4 + **mapbox-gl 3.24.0** |
| Map | **Mapbox GL JS only** (NOT Google Maps, NOT MapLibre, NOT Three.js) |
| Backend | FastAPI (Python ≥3.14) + Server-Sent Events |
| Reel ingestion | **Apify MCP** via `MCPServerStreamableHttp` → `https://mcp.apify.com/?tools=actors,docs,apify/instagram-reel-scraper` |
| LLM reasoning | OpenAI Agents SDK `Agent(model="gpt-5.5-2026-04-23")` + `gpt-4o` typed fallback + `WebSearchTool` |
| Place extraction | `_extract_for_reel` agent in `spike_e2e.py`: `output_type=ExtractionResult`, `WebSearchTool` for geocoding |
| Itinerary planning | `enricher` + `narrator_agent` in `spike_planner.py` |
| Weather | **Open-Meteo** HTTP (free, no API key, 10k calls/day) wrapped as `function_tool` |
| Booking — flights | **Duffel sandbox** test mode (`Duffel Airways`, $0 real-money risk, real-shape order IDs) |
| Booking — hotels | **Booking.com search-URL composer** (no auth) + `TC-MOCK-{sha1[:8]}` id |
| Booking — attractions | **Klook search-URL composer** (no auth) + `TC-MOCK-{sha1[:8]}` id |
| Booking overlay | Pydantic `BookingResult` with `is_mock=True` on every item |
| Multi-agent | OpenAI Agents SDK (`uv add openai-agents openai`) — `from agents import Agent, Runner` |
| Package manager | `uv` (`pyproject.toml` at PROJECT ROOT, not `backend/`) |

Dropped / never-used (don't reintroduce): react-pageflip, Framer Motion, Google Maps, MapLibre, Three.js, ffmpeg, transcription, Google Places, yt-dlp, requirements.txt.

---

## SSE Stream Termination Contract (MUST match frontend)

Every SSE stream ends with both, in this order:
1. `data: {"type": "result", "content": "<final JSON string>"}\n\n`
2. `data: [DONE]\n\n`

Frontend `parseSseStream` (`frontend/lib/trip/sse.ts`) breaks on `data: [DONE]`. The JSON `{type:"done"}` event is NOT used. Error paths also terminate with `[DONE]`.

Optional stage events for demo visibility:
`data: {"type":"stage","stage":"weather"|"booking"|"narrator","msg":"..."}\n\n`
Frontend tolerates unknown event types — adding stage events is non-breaking.

---

## Env Vars (required at startup)

Backend:
```
OPENAI_API_KEY
APIFY_TOKEN
DUFFEL_TEST_TOKEN     # MUST contain "_test_" — startup asserts; rejects prod tokens
USE_CACHE             # "true" to bypass live extraction, use data/places.json
DEMO_REEL_URLS        # comma-separated reel URLs for spike scripts (e.g. url1,url2,url3,url4)
DEMO_REEL_URL         # single-URL fallback — DEMO_REEL_URLS takes precedence
BOOKING_AID           # optional Booking.com affiliate id, may be empty for hackathon
```

Frontend:
```
NEXT_PUBLIC_MAPBOX_TOKEN
NEXT_PUBLIC_BACKEND_URL    # defaults to http://localhost:8000
```

---

## Project File Structure (ground truth — flat hackathon layout)

```
tripcanvas/
├── pyproject.toml                  # PROJECT ROOT (not backend/)
├── backend/
│   ├── main.py                     # FastAPI: /health /extract /itinerary
│   ├── spike.py                    # Phase 0 MCP smoke (not in serving path)
│   ├── spike_places.py             # Phase 0.5 smoke (not in serving path)
│   ├── spike_e2e.py                # ReelData, ExtractionResult, _scrape_reel, _extract_for_reel
│   ├── spike_e2e_planner.py        # run_extraction + run_pipeline orchestrator
│   ├── spike_planner.py            # enricher, narrator_agent, EnrichedContext, ItineraryOutput
│   ├── spike_weather.py            # NEW: weather_agent + fetch_weather (Open-Meteo)
│   ├── spike_booking.py            # NEW: booking_agent + book_flight (Duffel) + book_hotel + book_attraction (URL composers)
│   ├── lib/                        # placeholder package — leave empty (do NOT premature-modularize)
│   └── data/
│       ├── places.json             # COMMITTED cache (extract fallback)
│       └── planner_output.json     # COMMITTED cache (itinerary fallback)
└── frontend/
    ├── app/page.tsx                # routes to TripGenerationShell
    ├── app/trip/page.tsx           # same shell
    ├── components/map/TripMap.tsx
    ├── components/trip/{TripGenerationShell,TripCanvasShell,RightTripPanel,PlaceIntelPanel,SelectedPlaceCard}.tsx
    ├── lib/trip/{backend-types,generate-trip,normalize-trip,sse,types,place-intel}.ts
    └── package.json                # mapbox-gl 3.24.0
```

Earlier docs described `backend/lib/agents/{triage,research,hotels,transport,narrator}.py` and `backend/lib/extract/{apify_mcp,place_extractor,pipeline}.py`. THOSE FILES DO NOT EXIST. The spike layout above IS the layout — keep it flat for the hackathon.

---

## Architecture Data Flow

```
[Reel URLs × N]
  → Stage 1: sequential Apify scrapes inside one MCP context (~22s/reel measured)
       _scrape_reel agent → ReelData {caption, locationName, shortCode}

  → Stage 2: asyncio.gather — N place extractions in PARALLEL
       _extract_for_reel agent (gpt-5.5-2026-04-23, gpt-4o fallback)
           ModelSettings(tool_choice="required", parallel_tool_calls=True)
           tools=[WebSearchTool(search_context_size="high")]
           output_type=ExtractionResult

  → _flatten_and_dedup_by_name + _top_n_by_confidence (cap _MAX_PLACES=5)
  → /extract returns ExtractResponse {places, source, count} ← frontend zooms globe

  → /itinerary SSE:
        asyncio.gather(
            enricher,                  # research + hotel + flight (WebSearchTool, batched)
            weather_agent,             # NEW: Open-Meteo function tool, parallel
        ) → EnrichedContext (incl. weather_report)
        → booking_agent                # NEW: Duffel + URL composers, post-enricher
        → narrator_agent               # assembles ItineraryOutput JSON (incl. bookings)
  → SSE: start → heartbeat ×N → stage ×K (optional) → result → [DONE]
```

Empirical timings (measured 2026-05-27):

| Stage | Measured | Notes |
|---|---:|---|
| Apify per-reel scrape | ~22s | Agent-loop overhead — multiply actor budget by ~1.5 |
| 4-reel extraction total | 215s live | Reliably blows the 80s timeout |
| Enricher (5 places, 8 searches) | 144.7s | At top of 90-130s budget |
| Narrator (4-day JSON) | 27.3s | On target |
| Full **cache-path** pipeline | **172s** | Demo runs via cache |

Cache path is THE demo path. Live extraction blows `_EXTRACTION_TIMEOUT=80s` in normal network conditions; backend auto-falls back to `data/places.json` and sets `"source": "cache"`.

---

## Apify MCP Wiring (verified)

```python
async with MCPServerStreamableHttp(
    name="Apify MCP Server",
    params={
        "url": "https://mcp.apify.com/?tools=actors,docs,apify/instagram-reel-scraper",
        "headers": {"Authorization": f"Bearer {os.environ['APIFY_TOKEN']}"},
        "timeout": 120,
    },
    cache_tools_list=True,
    max_retry_attempts=3,
    client_session_timeout_seconds=300,   # CRITICAL: default 5s always times out
) as server:
    agent = Agent(name="reel_scraper", model="gpt-5.5-2026-04-23",
                  mcp_servers=[server], max_turns=4, ...)
```

- Actor slug: `apify/instagram-reel-scraper`. Fields returned: `videoUrl`, `caption`, `audioUrl`, `locationName`, `locationId`, `shortCode`.
- Two-step flow: actor tool returns run metadata → call `get-dataset-items` with `datasetId` for content.
- `audioUrl` captured but unused (transcription dropped — caption + `locationName` sufficient).
- Billing: $2.60 / 1,000 reels. Free tier $5 credit is enough for hackathon.

Hard-won learnings (do not regress):

- `ModelSettings(tool_choice="required", parallel_tool_calls=True)` on `_extract_for_reel` — without `required`, model sometimes skips `WebSearchTool` and hallucinates coords.
- `_MODEL_ERRORS = (openai.NotFoundError, openai.BadRequestError, openai.PermissionDeniedError)` — typed fallback to `gpt-4o`. Apply to BOTH scraper and extractor.
- `output_type` must be a Pydantic model, not a bare list: use `ExtractionResult(places: list[PlaceResult])`.
- Pydantic `lat/lng` bounds: `ge=-90, le=90`, `ge=-180, le=180` — catches hallucinated coords.
- `evidence_caption_quote` must be a verbatim substring of `caption + locationName` — drop the place otherwise.
- `WebSearchTool` calls appear as `ToolSearchCallItem` in SDK `new_items`, NOT `ToolCallItem` — match both class-name patterns when counting tool calls.

### Gate 1 tolerance (live vs cache)

`spike_planner.py:_verify_searches` is a soft gate, not a strict one — the LLM legitimately batches TASK A's per-place searches when ``_MAX_PLACES=5`` so the observed `web_search` count drifts below the naive `expected` value. Module-level ``_SEARCH_GATE_TOLERANCE = 2`` defines the slack; ``floor = max(3, expected - _SEARCH_GATE_TOLERANCE)``.

Three tiers:
- ``count >= expected``: silent pass.
- ``expected > count >= floor``: log a warning, return the live result anyway (absorbs batched TASK A).
- ``count < floor``: raise ``RuntimeError`` — `main.py` catches it and serves `data/planner_output.json` with ``"source": "cache"`` (guardrail #1).

Empirical signal: live runs at the ``_MAX_PLACES=5`` cap are the batching danger zone — 5 place searches collapsed into 3 parallel calls yielded 5 web_search calls vs the strict gate's 7, which used to force cache on every live run. Operationally: warnings on stage are noise — the floor is the actual breaker. Only escalate if ``RuntimeError`` rate climbs.

---

## Weather Agent (`spike_weather.py`)

```python
class DayForecast(BaseModel):
    date: str                # YYYY-MM-DD
    temp_min_c: float
    temp_max_c: float
    precipitation_mm: float
    summary: str             # one sentence: "Light rain, 14-19°C"

class WeatherReport(BaseModel):
    destination: str
    day_forecasts: list[DayForecast]
```

One `function_tool` (`fetch_weather`) calls `GET https://api.open-meteo.com/v1/forecast` with `daily=temperature_2m_max,temperature_2m_min,precipitation_sum&forecast_days=7`. Free, no auth, 10k calls/day non-commercial.

Agent:
```python
weather_agent = Agent(
    name="weather_agent",
    model="gpt-5.5-2026-04-23",
    tools=[fetch_weather],
    output_type=WeatherReport,
)
```

Wire-up: runs in parallel with `enricher` via `asyncio.gather` in `_run_planner_inner`. Result merged into `EnrichedContext.weather_report` (replaces free-text `weather_summary`).

**Fallback**: on 5xx or 8s timeout, return `WeatherReport(destination=<city>, day_forecasts=[])`. Pipeline never blocks.

---

## Booking Agent (`spike_booking.py`)

```python
class BookingItem(BaseModel):
    booking_id: str                          # "ord_..." for Duffel, "TC-MOCK-{sha1[:8]}" otherwise
    category: Literal["flight", "hotel", "attraction"]
    name: str
    price_estimate_sgd: float | None
    status: Literal["confirmed", "reserved"]
    book_url: str
    source: Literal["duffel_sandbox", "booking_deeplink", "klook_deeplink"]
    is_mock: bool                            # ALWAYS True
    notes: str                               # one sentence rationale

class BookingResult(BaseModel):
    items: list[BookingItem]
    total_estimate_sgd: float
    is_mock: bool = True
```

Three `function_tool`s:

| Tool | Backend | Returns |
|---|---|---|
| `book_flight(origin, destination, date)` | Duffel sandbox `POST /air/offer_requests` → `POST /air/orders` via httpx, `DUFFEL_TEST_TOKEN` | `BookingItem(source="duffel_sandbox", status="confirmed", booking_id=<duffel order id>, book_url=<PNR lookup>)` |
| `book_hotel(city, checkin, checkout, guests)` | URL composer (no API call) | `BookingItem(source="booking_deeplink", status="reserved", booking_id="TC-MOCK-{hash}", book_url="https://www.booking.com/searchresults.html?ss={city}&checkin={d1}&checkout={d2}&group_adults={n}&no_rooms=1{&aid=...}")` |
| `book_attraction(name, city)` | URL composer (no API call) | `BookingItem(source="klook_deeplink", status="reserved", booking_id="TC-MOCK-{hash}", book_url="https://www.klook.com/search/?keyword={urlencode(name)}")` |

`TC-MOCK` id formula: `"TC-MOCK-" + sha1(f"{category}|{name}|{date}").hexdigest()[:8]` — deterministic, replayable, idempotent.

Agent:
```python
booking_agent = Agent(
    name="booking_agent",
    model="gpt-5.5-2026-04-23",
    tools=[book_flight, book_hotel, book_attraction],
    output_type=BookingResult,
)
```

Wire-up: runs AFTER `enricher` (depends on hotel/flight selections), in parallel with `narrator_agent`. Result merged into `ItineraryOutput.bookings`.

**Non-negotiables**:
- `is_mock=True` on every item, even Duffel (the airline is sandbox-fake).
- `status="confirmed"` ONLY when `source="duffel_sandbox"`. All other sources use `status="reserved"`.
- `DUFFEL_TEST_TOKEN` startup-asserted to contain `_test_`. Production token aborts startup.
- Duffel call timeboxed 8s. On timeout/5xx, fall back to deep-link composer with `TC-MOCK-...` id and `source="booking_deeplink"`.
- Pre-existing `hotel_booking_url` / `flight_booking_url` in `EnrichedContext` STAY — those are "view-this-place" links, separate from the booking confirmation overlay.
- New HTTP dep: `uv add httpx>=0.27` (one call to Duffel, no Duffel SDK).

---

## Non-Negotiable Demo Guardrails

1. **Cache fallback**: `data/places.json` + `data/planner_output.json` MUST be committed and pre-populated. `USE_CACHE=true` replays in seconds. The planner's soft Gate 1 (`spike_planner.py:_verify_searches`) also routes to the cached itinerary when the enricher under-searches below the floor.
2. **Hallucination guard**: every place needs `evidence_caption_quote` + `evidence_frame_index`. No evidence → drop the place.
3. **Geocoding**: extractor uses `WebSearchTool` for `lat`/`lng`. Missing coords → drop the place.
4. **Model**: `gpt-5.5-2026-04-23` primary; typed `except _MODEL_ERRORS` fallback to `gpt-4o`. No dated `gpt-4o-*` snapshots.
5. **Latency**: backend auto-falls back to cache if live extraction > 80s (`_EXTRACTION_TIMEOUT`). All `/extract` and `/itinerary` JSON responses include `"source": "live" | "cache"`.
6. **Booking realism**: every `BookingItem.is_mock` MUST be `True`. `status="confirmed"` ONLY when `source="duffel_sandbox"`. Code reviewer rejects violations.
7. **Weather fallback**: Open-Meteo 5xx/timeout → return empty `day_forecasts`, never block the pipeline.
8. **Schema-parity**: any new structured field added backend-side MUST land in `frontend/lib/trip/backend-types.ts` in the same PR. No orphan fields.

---

## PLACE_SCHEMA (strict — do not change field names)

```json
{
  "type": "object",
  "required": ["name","category","city_or_region_guess","confidence","evidence_caption_quote","evidence_frame_index"],
  "properties": {
    "name":                   {"type": "string"},
    "category":               {"type": "string", "enum": ["restaurant","hotel","attraction","transport","other"]},
    "city_or_region_guess":   {"type": "string"},
    "confidence":             {"type": "number", "minimum": 0, "maximum": 1},
    "evidence_caption_quote": {"type": "string"},
    "evidence_frame_index":   {"type": "integer"},
    "place_id":               {"type": "string"},
    "lat":                    {"type": "number"},
    "lng":                    {"type": "number"},
    "formatted_address":      {"type": "string"}
  }
}
```

Frontend `BackendExtractedPlace` mirrors this (snake_case) and does not consume `evidence_frame_index` today. Backend may serialize `-1` as a sentinel when extractor returned `None`.

---

## Build Order (day-of, do not skip steps)

1. **Skeleton up** — FastAPI + Next.js boot, demo reels env vars set
2. **Extract pipeline** end-to-end on 4 reels → commit `data/places.json` ← MUST exist before polish
3. **Planner over cache** → `data/planner_output.json` → /itinerary SSE working
4. **Mapbox map render** with extracted-place pins (Zhi Hao)
5. **Right panel SSE stream** wired (Zhi Hao)
6. **Weather + booking agents** merged into planner orchestration (this section)
7. **Stage SSE events** for demo storytelling (optional polish)
8. **Rehearse**: default `USE_CACHE=true` if anything flaky

---

## Do NOT Spend Time On

- yt-dlp or custom Instagram scraper (Apify only)
- Custom agent orchestrator (use Agents SDK)
- Instagram Graph API / OAuth
- Splitting `enricher` into per-vertical files (flat layout is fine)
- Real booking checkout / production Duffel tokens / charging real money
- MCP for Duffel / Open-Meteo (function tools are simpler — see specs above)
- Reverting to pop-up book / react-pageflip / Google Maps (frontend has pivoted)
- requirements.txt (use pyproject.toml via uv)

---

## Codex Review Protocol

After writing/modifying any backend code:
```
/codex:review
```
Pass criteria: overall ≥ 7.0, no dimension ≤ 3.

---

## Day-of Hard Checkpoints

| Time | Gate |
|------|------|
| 11:30 | Skeleton running, /extract + /itinerary returning cache |
| 12:30 | Mapbox renders cached places, SSE stream visible in panel |
| 13:30 | Weather + booking agents merged, cache replay still <180s |
| 14:30 | Demo path locked, start pre-caching all images |
| 15:00 | No new features after this line |
| 17:00 | Code freeze, rehearse pitch ×5 |
