# AI-Native Hotel Base Flow Design

## Context

TripCanvas turns saved Instagram Reels into a mapped travel plan. The backend already has real agent work under the hood: Reel extraction, place grounding, live enrichment, weather, booking, and itinerary narration. The current product risk is that the demo can still look like a normal form-to-itinerary app because too much agent decision-making is hidden behind broad status messages.

The redesigned flow should make the agent's travel judgment visible without cluttering the map. The most important product story is not "a nice map." It is "the agent turns messy saved Reels into real places, chooses an efficient hotel base, adapts the schedule to weather, and explains its decisions."

## Visual Thesis

TripCanvas should feel like a minimal futuristic travel cockpit: cinematic enough to be memorable, restrained enough to keep the map, evidence, and agent decisions readable.

## Product Thesis

The core AI-native decision is hotel-base optimization. After the agent extracts places, it should ask what kind of hotel base the user wants, compare base areas against the extracted places, choose two actionable hotel candidates, then plan weather-aware days from the selected base.

## Approved V1 Flow

1. Starfield globe landing.
2. User clicks anywhere to begin.
3. Trip input appears with Reel URLs, dates, origin, budget, and general preferences.
4. `POST /extract` runs.
5. Map zooms to extracted places before itinerary planning.
6. Agent asks a hotel-base preference question on the map.
7. User selects chips and optional text, or uses "Optimize for me."
8. New `POST /hotel-base` runs as POST SSE.
9. Agent streams base-area scoring, selects a base, and returns two hotel candidates.
10. `POST /itinerary` runs with the selected hotel-base context.
11. Weather-aware planner sequences days around the forecast.
12. Final workspace shows the selected hotel as the hub, route branches, day weather strategy, and expandable agent evidence.

## V1 In Scope

- Starfield globe landing with original space-opera luxury direction.
- Existing input flow, visually cleaned up.
- Extraction-first map feedback.
- Hotel preference chips after extraction.
- New hotel-base optimizer backend contract.
- Base-area candidates plus two specific hotels in one hotel-base result.
- Weather-aware day sequencing as a core planning rule.
- Progressive disclosure across all panels.
- Final map with selected hotel hub, day weather strip, and expandable reasoning.

## V1 Out Of Scope

- Cabin POV input scene.
- Real `.glb` or `.gltf` model in the frontend.
- New 3D runtime or renderer.
- Full custom city scene.
- Star Wars parody or direct visual copying.
- Real booking checkout or payment.
- Showing every raw agent event by default.

## UX Principles

- One active decision per screen.
- The map is the canvas.
- The right panel shows the active agent decision.
- Evidence expands on click.
- The UI should show user-facing rationale, evidence, status, and final recommendations, not hidden chain-of-thought.
- The Starfield landing is a memorable entrance, not the product core.
- The cabin concept remains a future wrapper once an optimized asset exists.

## Progressive Disclosure Rules

### Landing

Visible:
- Globe.
- TripCanvas orbit typography.
- Click-to-begin prompt.

Hidden:
- Input form.
- Agent logs.
- Map controls.

### Input

Visible:
- Reel URLs.
- Dates.
- Origin.
- Budget.
- General preferences.
- Short pipeline preview.

Hidden:
- Hotel optimizer.
- Weather details.
- Final trip controls.

### Extraction

Visible:
- Map zooming to destination.
- Extracted pins.
- Compact agent panel with count, source, and confidence summary.

Expandable:
- Evidence quotes.
- Source URLs.

### Hotel Base

Visible:
- Extracted pins.
- Hotel preference chips.
- Active base candidate.
- Compact live agent reasoning.

Expandable:
- All base-area scores.
- Detailed tradeoffs.
- Full hotel candidate details.

### Weather Planning

Visible:
- Selected hotel hub.
- Weather strip by day.
- One-line "why this day" explanations.
- Itinerary progress.

Expandable:
- Full forecast.
- Weather adjustment explanations.
- Planner stage details.

### Final Workspace

Visible:
- Map.
- Current day route.
- Selected hotel hub.
- Compact day controls.
- Right panel summary.

Expandable:
- Why this base.
- Weather decisions.
- Reel evidence.
- Bookings.
- Place intel.

## Backend Contract

### `POST /hotel-base`

This is a POST SSE endpoint. Native `EventSource` is not suitable because the frontend must send a request body. The frontend should consume it with `fetch()` streaming, following the same `[DONE]` termination convention used by `/itinerary`.

Request:

```ts
type HotelBaseRequest = {
  places: BackendExtractedPlace[];
  preferences: UserPreferencesPayload;
  hotel_preferences: {
    chips: string[];
    free_text: string;
    optimize_for_me: boolean;
  };
};
```

SSE events:

```ts
type HotelBaseStreamEvent =
  | { type: "start"; destination: string; place_count: number }
  | { type: "stage"; stage: "scoring_base_areas" | "finding_hotels" | "selecting_base"; msg: string }
  | { type: "base_candidate"; candidate: BaseAreaCandidate }
  | { type: "hotel_candidate"; candidate: HotelCandidate }
  | { type: "result"; content: string; elapsed_s?: number }
  | { type: "error"; message: string };
```

Final result:

```ts
type HotelBaseResult = {
  source: "live" | "cache";
  selected_base: {
    id: string;
    name: string;
    score: number;
    center: { lat: number; lng: number };
    rationale: string;
    tradeoffs: string[];
  };
  base_areas: BaseAreaCandidate[];
  hotel_candidates: HotelCandidate[];
  selected_hotel_id: string;
};

type BaseAreaCandidate = {
  id: string;
  name: string;
  score: number;
  center: { lat: number; lng: number };
  transit_summary: string;
  rationale: string;
  tradeoffs: string[];
};

type HotelCandidate = {
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
```

### `POST /itinerary`

The existing `/itinerary` endpoint should accept an optional `hotel_base` object. When present, the planner should use the selected base/hotel as the trip hub and should not choose a conflicting hotel.

Request extension:

```ts
type ItineraryRequestPayload = {
  places: BackendExtractedPlace[];
  preferences: UserPreferencesPayload;
  hotel_base?: HotelBaseResult;
};
```

Output extension:

```ts
type WeatherAdjustment = {
  date: string;
  reason: string;
  moved_places: string[];
  weather_summary: string;
};

type ItineraryDay = {
  day_number: number;
  date: string;
  activities: string;
  hotel: string | null;
  narration: string;
  weather_strategy?: string;
};
```

The planner should also include:

```ts
{
  weather_report: WeatherReport | null;
  weather_adjustments: WeatherAdjustment[];
}
```

## Weather-Aware Planning Rules

- Outdoor, nature, observation, and theme-park places prefer clearer or lower-rain days.
- Indoor, cafe, shopping, restaurant, and covered activities can absorb rainy days.
- The planner should explain any weather-driven sequencing changes.
- If weather is unavailable, the planner should say it used a default route-order strategy and should not fabricate forecast details.

## Frontend Layout

### Landing

Full-bleed, no cards. Slow globe in the center, sparse starfield, `TRIPCANVAS` orbiting or arranged around the globe. Use one warm accent and restrained teal secondary details. The only action is click anywhere to begin.

### Input

Use the current input panel as the base but reduce visual weight. Keep the form readable. Include a compact pipeline preview: Extract places, Optimize hotel base, Check weather, Build route.

### Extraction

The map zooms to extracted places immediately after `/extract`. Right panel shows a compact extraction summary. Evidence is collapsed by default.

### Hotel Base

The right panel asks the adaptive hotel-base question. Chips and optional text sit above the map. While `/hotel-base` streams, base markers and candidate hotels appear progressively.

### Itinerary

The selected hotel becomes the visual hub. A day weather strip appears before full day controls. Route lines should emphasize the active day by default.

### Final Workspace

Keep the map primary. Right panel defaults to a concise agent summary with expandable sections for hotel-base reasoning, weather decisions, evidence, bookings, and place intel.

## Reliability And Fallbacks

- If `/hotel-base` fails and no cached result exists, the frontend should offer "Optimize for me with itinerary planner" and continue through `/itinerary` by appending hotel preferences to `free_text`.
- If `/hotel-base` returns `source: "cache"`, the UI should show a small cache badge and keep the recommendation visible.
- If weather is unavailable, weather-aware UI should show "Forecast unavailable" and the planner should fall back to route efficiency.
- If the user skips hotel preferences, default to shortest total travel time, near station, and good value.

## Acceptance Criteria

- A judge can see extracted places before the itinerary is generated.
- A judge can see the agent compare hotel base areas.
- The final trip shows one selected hotel/base as the route hub.
- The final trip explains at least one weather-aware scheduling decision when weather data is available.
- The UI never shows all reasoning, evidence, bookings, and weather details at once by default.
- The design remains usable if `/hotel-base` or weather falls back.

## Risks

- A new hotel-base endpoint adds backend surface area close to demo time.
- Streaming event details may vary across OpenAI Agents SDK versions.
- Base-area scoring can be vague unless the prompt forces concrete tradeoffs.
- Cache files currently risk destination mismatch if `places.json` and `planner_output.json` are not aligned before demo.
- The Starfield landing adds visual polish but should not delay the hotel-base and weather-aware flow.
