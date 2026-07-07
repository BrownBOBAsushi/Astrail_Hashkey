# Astrail

Astrail is an AI-native travel agent that turns saved Instagram travel Reels
into a mapped itinerary, a hotel decision, and a human-approved on-chain payment
proof.

The first Astrail build won **2nd place at the SEA x OpenAI Regional Codex
Hackathon in Singapore**. That version demonstrated the agentic travel and
payment flow on a Base testnet rail. This repository is the HashKey Chain Japan
hackathon build: the same Mapbox-first travel agent experience, now extended to
execute **HashKey HSP + x402 testnet USDC payments on HashKey Chain testnet**.

Website: https://astrail.xyz/

## What It Does

Astrail starts from messy travel inspiration, not a fixed destination form.
A user provides Instagram Reel URLs, travel dates, budget, origin city, and
free-text preferences. Backend agents extract real places, research tradeoffs,
recommend a hotel base, build a day-by-day itinerary, and prepare a constrained
hotel payment flow.

The frontend renders the result as a Mapbox 3D travel canvas. Users can inspect
detected places, route legs, hotel reasoning, source evidence, and payment state
before approving the final action.

The hotel fulfillment remains mock-only for demo safety. The payment proof is
real testnet commerce: a user-approved AP2-style mandate gates a HashKey HSP +
x402 payment, and the UI links to the HashKey testnet transaction and HSP
receipt.

## Demo Flow

1. Paste 3-4 Instagram Reel URLs, dates, budget, origin city, and travel
   preferences.
2. Astrail extracts real places from Reel content and geocodes them.
3. The Mapbox globe zooms into the destination as soon as places are grounded.
4. Agents research place fit, weather, route feasibility, hotel-base tradeoffs,
   and itinerary timing.
5. The UI shows a tilted 3D map, route legs, itinerary cards, hotel options, and
   an AI explanation panel.
6. The user approves an AP2-style mandate for one bounded mock hotel-booking
   action.
7. Astrail executes a HashKey HSP + x402 testnet USDC payment.
8. The receipt shows mock hotel fulfillment plus verifiable HashKey Chain
   transaction proof.

For demo reliability, the UI also includes:

- **Demo Reels** quick fill for the canonical demo set.
- **Backend Cache** replay from committed backend cache files.
- Clear live/cache source labels.

## Why This Is AI-Native

Astrail is designed around agentic operations, not AI autocomplete.

- **Messy input becomes structured action:** saved Reels become real mapped
  places, a hotel base, an itinerary, and a payment handoff.
- **The map is the planning surface:** users inspect the agent's decisions
  spatially instead of reading a static itinerary first.
- **The agent shows product-level evidence:** confidence, sources, route
  tradeoffs, weather fit, hotel rationale, and payment state are visible without
  exposing hidden chain-of-thought.
- **Action stays constrained:** AP2-style approval binds the booking action,
  selected hotel, amount, wallet rail, and mock-only fulfillment scope.
- **Payment is verifiable:** HashKey HSP + x402 produces testnet on-chain proof
  instead of only a simulated checkout state.

## Payment Architecture

Astrail separates payment from booking fulfillment.

- **AP2-style mandate:** the user approves a specific hotel-booking action under
  visible constraints.
- **HashKey HSP:** the backend signs and registers the payment mandate through
  the HashKey HSP sandbox.
- **x402 settlement:** the payer wallet signs the x402 EIP-3009 payment and the
  facilitator settles testnet USDC on HashKey Chain testnet.
- **Mock hotel receipt:** Astrail returns a `ASTRAIL-MOCK-HOTEL-*` receipt and
  clearly labels that no real hotel reservation was created.

Supported payment modes:

- `X402_MODE=simulation` for local, offline-safe demo runs.
- `X402_MODE=hsp_testnet` for the HashKey Chain testnet payment path.

HashKey testnet defaults used by the demo:

```text
HSP coordinator: https://hsp-hackathon.hashkeymerchant.com
HSP facilitator: https://hsp-hackathon.hashkeymerchant.com/facilitator
Chain: hashkey-testnet
Chain ID: 133
x402 network: eip155:133
RPC: https://testnet.hsk.xyz
Explorer: https://testnet-explorer.hsk.xyz
USDC: 0x8FE3cB719Ee4410E236Cd6b72ab1fCDC06eF53c6
```

Secrets stay local-only in environment variables. Do not commit private keys or
API keys.

## Product Guardrails

- Human approval is required before payment.
- `/hotel-booking` verifies the signed AP2-style mandate before payment.
- Hotel fulfillment is always mock-only.
- Testnet payment failures fail closed; `hsp_testnet` never falls back to fake
  success.
- The frontend links to real proof only: HashKey transaction and HSP receipt.
- The demo can replay committed cache data when live extraction or research is
  slow.

## Frontend

The frontend is a Next.js App Router app in `frontend/`.

Implemented surface:

- Mapbox GL JS 3D globe as the first screen.
- Reel URL and trip preference input.
- Demo cache and demo Reel controls.
- Generation timeline for extraction, grounding, hotel base, itinerary, and
  approval.
- Full-screen tilted Mapbox 3D map with extracted-place pins.
- Left trip panel with detected places, confidence, filters, and day selection.
- Right AI panel with selected-place explanation, evidence, tradeoffs, and next
  action.
- Bottom itinerary rail with day-by-day route cards.
- Human-in-the-loop payment panel for AP2 approval and HashKey HSP + x402
  payment proof.

Frontend stack:

- Next.js 15
- React 19
- Tailwind CSS v4
- `mapbox-gl` 3.24.0

## Backend

The backend is a FastAPI service in `backend/`.

Core endpoints:

- `GET /health` - service health check.
- `GET /demo-cache` - instant replay of committed demo data.
- `POST /extract` - Reel URLs to extracted places, with cache fallback.
- `POST /hotel-base` - streams hotel-base optimization.
- `POST /itinerary` - POST SSE stream for final itinerary planning.
- `POST /ap2/hotel-booking-mandate` - creates a signed AP2-style hotel mandate.
- `POST /hotel-booking` - verifies the mandate and runs the payment loop.

Backend capabilities:

- OpenAI Agents SDK for extraction, research, hotel-base optimization,
  narration, and booking logic.
- Apify Instagram Reel scraper integration.
- Web research for places, hotels, flights, and itinerary context.
- Open-Meteo weather data.
- HashKey HSP + x402 payment adapter behind the existing payment boundary.
- Committed demo caches:
  - `backend/data/places.json`
  - `backend/data/hotel_base_output.json`
  - `backend/data/planner_output.json`

## Architecture

```text
Instagram Reels + traveler preferences
  -> Apify scraper
  -> OpenAI extraction agents
  -> real places + confidence + evidence
  -> Mapbox globe zooms into destination
  -> hotel-base agent chooses base area and hotel candidate
  -> planner agents research weather, routing, timing, and preferences
  -> itinerary JSON + payment context
  -> Mapbox 3D travel canvas
  -> AP2-style user approval
  -> HashKey HSP + x402 testnet USDC payment
  -> mock hotel receipt + HashKey explorer proof
```

Frontend consumes `/itinerary` with `fetch()` streaming because it is a POST SSE
endpoint. Streams terminate with:

```text
data: {"type":"result","content":"<final JSON string>"}
data: [DONE]
```

## Running Locally

Backend:

```bash
uv sync
uv run uvicorn backend.main:app --port 8000
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

Required environment for the full live path:

```bash
OPENAI_API_KEY=...
APIFY_TOKEN=...
NEXT_PUBLIC_MAPBOX_TOKEN=...
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
```

For local cache replay, set:

```bash
USE_CACHE=true
X402_MODE=simulation
```

For HashKey HSP testnet payment, use local-only secrets:

```bash
X402_MODE=hsp_testnet
AP2_MODE=demo_signed
AP2_DEMO_SIGNING_SECRET=...

HSP_COORDINATOR_URL=https://hsp-hackathon.hashkeymerchant.com
HSP_FACILITATOR_URL=https://hsp-hackathon.hashkeymerchant.com/facilitator
HSP_ISSUER_URL=https://hsp-hackathon.hashkeymerchant.com/issuer
HSP_RPC_URL=https://testnet.hsk.xyz
HSP_CHAIN=hashkey-testnet
HSP_SDK_PATH=C:/tmp/hsp
HSP_API_KEY=...
HSP_PRIVATE_KEY=...
HSP_PAYER_ADDRESS=...
HSP_PAYEE_ADDRESS=...
HSP_USDC_ADDRESS=0x8FE3cB719Ee4410E236Cd6b72ab1fCDC06eF53c6
HSP_ADAPTER_ADDRESS=0x467AaF355DF243379B961Ce00abBae20c1e25012
HSP_PAYMENT_AMOUNT_USDC=0.01
```

The HashKey hackathon SDK is currently used from a local clone:

```bash
git clone https://github.com/project-hsp/hsp C:/tmp/hsp
cd C:/tmp/hsp
npm install
```

## Demo Script

1. Start backend on `8000` and frontend on `3000`.
2. Open Astrail.
3. Click **Demo Reels** or paste test Reel URLs.
4. Use **Backend Cache** for the fastest live demo path.
5. Show the map zoom, extracted places, selected route leg, hotel base, and AI
   explanation panel.
6. Approve the AP2-style hotel mandate.
7. Run the HashKey HSP + x402 payment.
8. Open the HashKey transaction proof and HSP receipt.
9. Point out that the hotel receipt is mock-only while payment proof is testnet
   on-chain.

## Judging Alignment

**AI-native product:** the workflow starts from unstructured social media and
turns it into a mapped travel plan plus constrained action.

**Operational depth:** Astrail models the work a travel planner would do:
identify places, check feasibility, choose a base, sequence days, reason about
weather and transit, and prepare payment.

**Agentic commerce:** the system moves from recommendation to user-approved
payment through AP2-style constraints and HashKey HSP + x402 settlement.

**Transparency and trust:** the UI shows evidence, rationale, route context,
cache/live source state, payment status, and explorer proof.

**Demo reliability:** committed cache files and the `/demo-cache` endpoint keep
the product presentable even when scraping or live research is slow.

## Verification

Frontend checks, from `frontend/`:

```bash
npm run test:unit
npm run typecheck
npm run build
```

Backend checks, from the repo root:

```bash
uv run pytest backend/tests -q
```

Focused HashKey payment checks:

```bash
uv run pytest backend/tests/test_hashkey_hsp_payments.py backend/tests/test_agentic_hotel_payments.py backend/tests/test_demo_cache_endpoint.py -q
```

## Docs

- `AGENTS.md` - agent-facing product and implementation rules.
- `CLAUDE.md` - detailed backend contracts, package layout, SSE contract, env
  vars, and demo guardrails.
- `UPDATE.md` - HashKey HSP/x402 handoff context.
- `docs/reference/agentic-payments.md` - AP2/x402 payment reference.
- `docs/superpowers/` - specs and implementation plans.
