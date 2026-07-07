# TripCanvas HashKey HSP Handoff Update

## Why This File Exists

The user is moving TripCanvas into a new equivalent fork because the HashKey Chain Japan hackathon does not allow repositories created before June 19. The original TripCanvas work started on June 6, so future execution may happen in a new repo with the same codebase shape but fresh history.

Use this file to restore context in a new session or fork. It intentionally contains no private key and no HSP API key.

## Current Product Direction

TripCanvas should be positioned for this hackathon as:

```text
AI travel agent -> AP2 approval -> HashKey HSP + x402 testnet payment -> verifiable receipt
```

The product is not "just a map." The prize story is agentic commerce:

- AI turns messy Instagram Reels into real travel decisions.
- The user approves bounded hotel payment terms.
- The agent pays through HashKey HSP/x402 on testnet.
- The UI shows a receipt and explorer proof.
- Hotel fulfillment remains mock-only and must be labeled as mock.

## Repo Constraints

Do not rewrite the TripCanvas experience.

Keep:

- Existing Next.js frontend under `frontend/`.
- Existing Mapbox-first trip surface.
- Existing AP2 demo mandate flow.
- Existing `/ap2/hotel-booking-mandate` and `/hotel-booking` endpoints.
- Existing mock hotel booking disclaimer.

Avoid:

- Mainnet payment for the first build.
- Real hotel fulfillment.
- Exposing secrets in frontend code.
- Replacing the map or itinerary pipeline.
- Reviving removed map/flipbook ideas.

## HashKey HSP Testnet Setup

Public constants:

```text
HSP_COORDINATOR_URL=https://hsp-hackathon.hashkeymerchant.com
HSP_CHAIN=hashkey-testnet
HashKey chain ID=133
HashKey x402 network=eip155:133
HSP_FACILITATOR_URL=https://hsp-hackathon.hashkeymerchant.com/facilitator
HSP_ISSUER_URL=https://hsp-hackathon.hashkeymerchant.com/issuer
HashKey testnet RPC=https://testnet.hsk.xyz
HashKey testnet explorer=https://testnet-explorer.hsk.xyz
USDC=0x8FE3cB719Ee4410E236Cd6b72ab1fCDC06eF53c6
HSP adapter=0x467AaF355DF243379B961Ce00abBae20c1e25012
```

User payer wallet:

```text
0x10252A4a30ea30D179678C7C4f7a452321945E30
```

Verified on July 7, 2026:

- `eth_chainId` from `https://testnet.hsk.xyz` returns `0x85`, which is chain ID 133.
- The payer wallet received faucet funds.
- HSK balance was verified by RPC as 0.05 HSK.
- USDC token address is `0x8FE3...`, not `0x8FF3...`.
- USDC balance was verified by RPC as 10 USDC.

Local-only secrets the user has or will provide in their own terminal:

```text
HSP_API_KEY
HSP_PRIVATE_KEY
```

Do not ask the user to paste these into chat. Do not commit them.

Still needed before a full demo:

```text
HSP_PAYEE_ADDRESS=<second throwaway hotel-agent wallet>
```

The payee should be a second test wallet so the demo reads as traveler agent pays hotel agent.

## Planned Files

Design spec:

```text
docs/superpowers/specs/2026-07-07-hashkey-hsp-x402-design.md
```

Implementation plan:

```text
docs/superpowers/plans/2026-07-07-hashkey-hsp-x402.md
```

Handoff:

```text
UPDATE.md
```

## Intended Implementation Slice

Backend:

- Add `backend/payments/hsp.py`.
- Add `HSPConfig`, `HSPConfigError`, and `HSPReceiptSummary`.
- Add optional `hsp` metadata to `PaymentReceipt`.
- Add `X402_MODE=hsp_testnet`.
- Add `HSPX402Adapter` behind current payment adapter boundary.
- Fail closed when HSP config is missing or HSP settlement fails.

Frontend:

- Add HashKey explorer link support in `frontend/lib/trip/payment-ui.ts`.
- Add `hashkey-testnet` and `eip155:133` labels in payment formatting.
- Update `BookingFlowPanel` copy to say HashKey HSP + x402 when appropriate.
- Preserve existing AP2 and x402 UI flow.

Docs:

- Update `docs/reference/agentic-payments.md` with HashKey env vars and security notes.

## Verification Commands

Backend:

```powershell
uv run pytest backend/tests/test_hashkey_hsp_payments.py backend/tests/test_agentic_hotel_payments.py backend/tests/test_demo_cache_endpoint.py -q
```

Frontend:

```powershell
cd frontend
npm run test:unit
npm run typecheck
npm run build
```

Manual HSP smoke:

1. Set HSP env vars in PowerShell.
2. Run backend on port 8000.
3. Request `/ap2/hotel-booking-mandate`.
4. Submit `/hotel-booking` with the signed AP2 mandate.
5. Confirm response contains HashKey HSP metadata and mock booking receipt.
6. Open HashKey explorer and HSP explorer links.

## Security Notes

- Never commit `.env` values.
- Never put HSP secrets in `NEXT_PUBLIC_*`.
- Use only throwaway testnet wallets.
- If a private key is pasted into chat or a public file, abandon that wallet.
- In `hsp_testnet` mode, never fall back to simulated success after an HSP failure.
