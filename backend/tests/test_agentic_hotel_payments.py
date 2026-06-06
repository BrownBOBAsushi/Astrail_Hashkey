import copy
import hashlib
import json
import os
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend.main import app
from backend.spike_agentic_payments import (
    AgenticHotelPaymentService,
    BookingMandate,
    HotelBookingRequest,
    X402SimulationAdapter,
    load_hotel_base_dict,
    resolve_selected_hotel,
)


DATA_DIR = Path(__file__).resolve().parents[1] / "data"


def booking_ready_hotel_base() -> dict:
    with (DATA_DIR / "hotel_base_output.json").open(encoding="utf-8") as fh:
        hotel_base = json.load(fh)

    hotel_base = copy.deepcopy(hotel_base)
    hotel_base["payment_context"] = {
        "payment_protocol": "x402",
        "network": "base-sepolia",
        "asset": "USDC",
        "agent_payment_usd": "0.01",
        "mock_booking_only": True,
    }
    for hotel in hotel_base["hotel_candidates"]:
        if hotel["id"] == hotel_base["selected_hotel_id"]:
            hotel.update(
                {
                    "city": "Osaka",
                    "area": "Dotonbori",
                    "price_per_night_sgd": 165,
                    "station_walk_min": 6,
                    "convenience_store_walk_min": 2,
                    "quiet_score": 6,
                    "route_efficiency_score": 9,
                    "budget_tier": "mid_range",
                    "amenities": ["breakfast", "near_station", "laundry"],
                    "mock_available_rooms": 3,
                    "room_type": "Standard double room",
                    "cancellation_policy": "Free cancellation until 48 hours before check-in",
                }
            )
    return hotel_base


def demo_mandate(**overrides) -> BookingMandate:
    data = {
        "mandate_id": "ap2-demo-tc-osaka-001",
        "mode": "autonomous",
        "allowed_action": "mock_hotel_booking",
        "city": "Osaka",
        "checkin": "2026-06-10",
        "checkout": "2026-06-13",
        "guests": 2,
        "budget": "mid_range",
        "hotel_preferences": ["near_station", "quiet", "near_convenience_store"],
        "max_total_sgd": 650,
        "max_agent_payment_usd": "0.01",
        "payment_protocol": "x402",
        "network": "base-sepolia",
        "expires_at": "2030-06-10T00:00:00Z",
        "requires_user_visible_receipt": True,
        "mock_booking_only": True,
    }
    data.update(overrides)
    return BookingMandate.model_validate(data)


def demo_request(**overrides) -> HotelBookingRequest:
    data = {
        "trip_id": "tc-demo-osaka-001",
        "hotel_base": booking_ready_hotel_base(),
        "mandate": demo_mandate(),
        "idempotency_key": (
            "tc-demo-osaka-001:ap2-demo-tc-osaka-001:"
            "hotel_forza_osaka_namba_dotonbori"
        ),
    }
    data.update(overrides)
    return HotelBookingRequest.model_validate(data)


class AgenticHotelPaymentTests(unittest.TestCase):
    def test_cached_hotel_base_output_loads_and_resolves_selected_hotel(self):
        hotel_base = load_hotel_base_dict()

        selected_hotel = resolve_selected_hotel(hotel_base)

        self.assertEqual(selected_hotel["id"], hotel_base["selected_hotel_id"])
        self.assertEqual(selected_hotel["name"], "Hotel Forza Osaka Namba Dotonbori")

    def test_booking_requires_payment_before_proof(self):
        service = AgenticHotelPaymentService()
        request = demo_request()

        response = service.attempt_booking(request)

        self.assertEqual(response.status, "payment_required")
        self.assertIsNone(response.receipt)
        self.assertIsNotNone(response.payment_required)
        self.assertEqual(response.payment_required.protocol, "x402")
        self.assertEqual(response.payment_required.amount, "0.01")
        self.assertEqual(
            [event.type for event in response.audit_events],
            ["mandate_validated", "payment_required"],
        )

    def test_orchestrator_pays_retries_and_returns_deterministic_mock_receipt(self):
        service = AgenticHotelPaymentService()
        request = demo_request()

        first = service.run_payment_loop(request)
        second = service.run_payment_loop(request)

        expected_booking_id = (
            "TC-MOCK-HOTEL-"
            + hashlib.sha1(
                "tc-demo-osaka-001|ap2-demo-tc-osaka-001|"
                "hotel_forza_osaka_namba_dotonbori|2026-06-10|2026-06-13|2".encode()
            )
            .hexdigest()[:8]
            .upper()
        )
        self.assertEqual(first.status, "mock_confirmed")
        self.assertEqual(first.receipt.booking_id, expected_booking_id)
        self.assertEqual(first.receipt.status, "mock_confirmed")
        self.assertTrue(first.receipt.is_mock)
        self.assertIn("No real hotel reservation was created", first.receipt.receipt_note)
        self.assertEqual(first.payment.status, "simulated")
        self.assertEqual(first.payment.tx_hash, second.payment.tx_hash)
        self.assertEqual(first.receipt.booking_id, second.receipt.booking_id)
        self.assertEqual(
            [event.type for event in first.audit_events],
            [
                "mandate_validated",
                "payment_required",
                "payment_completed",
                "booking_confirmed",
            ],
        )

    def test_mandate_and_booking_constraints_fail_closed_without_receipt(self):
        cases = [
            (
                "wrong action",
                {"mandate": demo_mandate(allowed_action="real_hotel_booking")},
                "mandate_action_not_allowed",
            ),
            (
                "non mock mandate",
                {"mandate": demo_mandate(mock_booking_only=False)},
                "mock_booking_required",
            ),
            (
                "expired mandate",
                {"mandate": demo_mandate(expires_at="2020-06-10T00:00:00Z")},
                "mandate_expired",
            ),
            (
                "over budget stay",
                {"mandate": demo_mandate(max_total_sgd=100)},
                "stay_total_exceeds_mandate",
            ),
            (
                "agent payment over mandate",
                {"mandate": demo_mandate(max_agent_payment_usd="0.005")},
                "agent_payment_exceeds_mandate",
            ),
        ]

        for name, overrides, expected_code in cases:
            with self.subTest(name=name):
                response = AgenticHotelPaymentService().run_payment_loop(
                    demo_request(**overrides)
                )

                self.assertEqual(response.status, "rejected")
                self.assertIsNone(response.receipt)
                self.assertEqual(response.error.code, expected_code)
                self.assertEqual(response.audit_events[-1].type, "booking_rejected")

    def test_hotel_booking_mode_must_stay_mock(self):
        with patch.dict(os.environ, {"HOTEL_BOOKING_MODE": "live"}):
            response = AgenticHotelPaymentService().run_payment_loop(demo_request())

        self.assertEqual(response.status, "rejected")
        self.assertIsNone(response.receipt)
        self.assertEqual(response.error.code, "hotel_booking_mode_not_mock")

    def test_selected_hotel_without_rooms_is_rejected(self):
        hotel_base = booking_ready_hotel_base()
        for hotel in hotel_base["hotel_candidates"]:
            if hotel["id"] == hotel_base["selected_hotel_id"]:
                hotel["mock_available_rooms"] = 0

        response = AgenticHotelPaymentService().run_payment_loop(
            demo_request(hotel_base=hotel_base)
        )

        self.assertEqual(response.status, "rejected")
        self.assertIsNone(response.receipt)
        self.assertEqual(response.error.code, "no_mock_rooms_available")

    def test_smoke_path_missing_selected_hotel_is_rejected_without_receipt(self):
        hotel_base = booking_ready_hotel_base()
        hotel_base["selected_hotel_id"] = "missing-hotel"

        response = AgenticHotelPaymentService().run_payment_loop({
            "trip_id": "tc-demo-osaka-001",
            "hotel_base": hotel_base,
        })

        self.assertEqual(response.status, "rejected")
        self.assertIsNone(response.receipt)
        self.assertEqual(response.error.code, "selected_hotel_not_found")

    def test_payment_failure_returns_audit_event_and_no_receipt(self):
        service = AgenticHotelPaymentService(
            payment_adapter=X402SimulationAdapter(simulate_failure=True)
        )

        response = service.run_payment_loop(demo_request())

        self.assertEqual(response.status, "payment_failed")
        self.assertIsNone(response.receipt)
        self.assertEqual(response.error.code, "payment_simulation_failed")
        self.assertEqual(response.audit_events[-1].type, "payment_failed")

    def test_hotel_booking_endpoint_runs_backend_smoke_path(self):
        response = TestClient(app).post(
            "/hotel-booking",
            json={
                "trip_id": "tc-demo-osaka-001",
                "idempotency_key": "tc-demo-osaka-001:demo",
            },
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["status"], "mock_confirmed")
        self.assertEqual(payload["payment"]["status"], "simulated")
        self.assertTrue(payload["receipt"]["booking_id"].startswith("TC-MOCK-HOTEL-"))
        self.assertIn("No real hotel reservation was created", payload["receipt"]["receipt_note"])
        self.assertEqual(
            [event["type"] for event in payload["audit_events"]],
            [
                "mandate_validated",
                "payment_required",
                "payment_completed",
                "booking_confirmed",
            ],
        )


if __name__ == "__main__":
    unittest.main()
