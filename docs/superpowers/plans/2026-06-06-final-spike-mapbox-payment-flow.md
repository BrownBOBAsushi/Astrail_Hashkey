# Final Spike Mapbox Payment Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the TripCanvas demo show full day route sequencing on Mapbox and make AP2/x402 hotel booking approval visibly human-in-the-loop with wallet explorer links.

**Architecture:** Keep the existing Next.js and Mapbox GL JS surface. Add focused frontend helpers for route-stop resolution, Mapbox Directions geometry, and payment explorer links, then wire them into `TripMap`, the bottom timeline, the left extracted-place panel, and the right agent approval rail.

**Tech Stack:** Next.js App Router, React, TypeScript, Mapbox GL JS, FastAPI backend endpoints `/demo-cache`, `/ap2/hotel-booking-mandate`, and `/hotel-booking`.

---

### Task 1: Full Day Route Data

**Files:**
- Create: `frontend/lib/trip/day-route.ts`
- Create: `frontend/lib/trip/day-route.test.mjs`
- Modify: `frontend/lib/trip/types.ts`
- Modify: `frontend/lib/trip/normalize-trip.ts`

- [ ] Write failing tests proving Day 1 can resolve Narita arrival, selected hotel, Hamarikyu Gardens, Grand Hyatt Tokyo, and Tokyo Midtown from the cache-shaped data.
- [ ] Add optional `lat` and `lng` to `TripDayStop`.
- [ ] Normalize optional stop coordinates when the backend starts returning them.
- [ ] Implement known demo stop coordinates plus hotel-base coordinates as deterministic fallback.
- [ ] Implement Mapbox Directions URL/fetch helpers with a shaped local fallback route.
- [ ] Run `npm run test:unit` and confirm the new route tests pass.

### Task 2: Mapbox Route Rendering

**Files:**
- Modify: `frontend/components/map/TripMap.tsx`
- Modify: `frontend/components/trip/TripCanvasShell.tsx`
- Modify: `frontend/components/trip/TripGenerationShell.tsx`

- [ ] Use all trip places for route planning even when day/category filters hide pins.
- [ ] Build one route plan per day from resolved route stops.
- [ ] Fetch Mapbox Directions geometry when the public token is available.
- [ ] Fall back to shaped route coordinates instead of raw straight segments.
- [ ] Add route-stop markers for supporting itinerary stops so extracted and agent-added places are visible on the map.
- [ ] Preserve existing pin interactions and selected-place fly-to behavior.

### Task 3: Timeline And Intel UI

**Files:**
- Modify: `frontend/lib/trip/itinerary-ui.ts`
- Modify: `frontend/lib/trip/itinerary-ui.test.mjs`
- Modify: `frontend/components/trip/BottomPlaceRail.tsx`
- Modify: `frontend/components/trip/PlaceIntelPanel.tsx`
- Modify: `frontend/components/trip/LeftTripPanel.tsx`

- [ ] Show day stops from `TripDay.stops` instead of only mapped extracted place IDs.
- [ ] Keep non-geocoded supporting stops visible but disabled for selection.
- [ ] Make the bottom rail read as route sequence with morning, afternoon, evening labels.
- [ ] Add an extracted Reel places section in the left panel with confidence/source badges.
- [ ] Hide stop-lock and regenerate controls from the right-side place details for the demo.

### Task 4: Agentic Booking Climax

**Files:**
- Create: `frontend/lib/trip/payment-ui.ts`
- Create: `frontend/lib/trip/payment-ui.test.mjs`
- Modify: `frontend/components/trip/TripGenerationShell.tsx`

- [ ] Write tests for BaseScan wallet and transaction link helpers.
- [ ] Make `PlanApprovalCard` visually emphasize the two-step flow: approve AP2 mandate, then run x402 payment.
- [ ] After confirmation, show clear success state plus buttons for Orchestrator and Hotel Agent Base Sepolia wallet pages.
- [ ] Keep simulated payment wording honest while still surfacing real-settlement links when the backend returns a real transaction hash.
- [ ] Remove the visible steering-control block from the right rail for this demo.

### Task 5: Verification

**Files:**
- No source file changes expected.

- [ ] Restart backend locally and verify `GET /demo-cache` works.
- [ ] Verify `/ap2/hotel-booking-mandate` and `/hotel-booking` can complete the payment loop.
- [ ] Start the frontend dev server.
- [ ] In browser, load backend cache, inspect Day 1 route sequence, approve hotel booking, and verify wallet buttons are visible after success.
- [ ] Run `npm run test:unit`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run build`.
