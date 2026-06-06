"""Simulation-first agentic hotel payments for TripCanvas.

This module keeps the AP2-shaped mandate and x402-shaped booking loop behind a
small service boundary. It does not perform network calls or real settlement.
"""

from __future__ import annotations

import hashlib
import json
import os
from dataclasses import dataclass
from datetime import date, datetime, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


_DEFAULT_TRIP_ID = "tc-demo-osaka-001"
_DEFAULT_CHECKIN = date(2026, 6, 10)
_DEFAULT_CHECKOUT = date(2026, 6, 13)
_DEFAULT_NETWORK = "base-sepolia"
_DEFAULT_ASSET = "USDC"
_DEFAULT_AGENT_PAYMENT_USD = Decimal("0.01")
_DEFAULT_PAYER = "0xOrchestratorDemo"
_DEFAULT_PAYEE = "0xHotelAgentDemo"
_RECEIPT_NOTE = "Demo-safe mock booking. No real hotel reservation was created."


class AuditEvent(BaseModel):
    type: str
    message: str
    simulated: Optional[bool] = None


class BookingError(BaseModel):
    code: str
    message: str


class BookingMandate(BaseModel):
    mandate_id: str
    mode: str = "autonomous"
    allowed_action: str
    city: str
    checkin: date
    checkout: date
    guests: int = Field(ge=1)
    budget: str
    hotel_preferences: list[str] = Field(default_factory=list)
    max_total_sgd: int = Field(gt=0)
    max_agent_payment_usd: Decimal
    payment_protocol: Literal["x402"] = "x402"
    network: str = _DEFAULT_NETWORK
    expires_at: datetime
    requires_user_visible_receipt: bool = True
    mock_booking_only: bool = True


class HotelBookingRequest(BaseModel):
    trip_id: str = _DEFAULT_TRIP_ID
    hotel_base: Optional[dict[str, Any]] = None
    mandate: Optional[BookingMandate] = None
    idempotency_key: Optional[str] = None


class PaymentInstructions(BaseModel):
    protocol: Literal["x402"] = "x402"
    network: str
    asset: str
    amount: str
    payer: str
    payee: str
    hotel_id: str
    payment_request_id: str
    message: str
    simulated: bool = True


class PaymentProof(BaseModel):
    protocol: Literal["x402"] = "x402"
    network: str
    asset: str
    amount: str
    payer: str
    payee: str
    hotel_id: str
    payment_request_id: str
    idempotency_key: str
    tx_hash: str
    status: Literal["simulated"] = "simulated"
    simulated: bool = True


class PaymentReceipt(BaseModel):
    protocol: Literal["x402"] = "x402"
    network: str
    asset: str
    amount: str
    payer: str
    payee: str
    tx_hash: str
    status: Literal["simulated"] = "simulated"


class HotelBookingReceipt(BaseModel):
    type: Literal["hotel_booking_receipt"] = "hotel_booking_receipt"
    booking_id: str
    status: Literal["mock_confirmed"] = "mock_confirmed"
    is_mock: bool = True
    hotel: dict[str, Any]
    stay: dict[str, Any]
    pricing: dict[str, Any]
    payment: PaymentReceipt
    mandate: dict[str, Any]
    receipt_note: str = _RECEIPT_NOTE


class HotelBookingResponse(BaseModel):
    status: Literal["payment_required", "mock_confirmed", "rejected", "payment_failed"]
    audit_events: list[AuditEvent] = Field(default_factory=list)
    payment_required: Optional[PaymentInstructions] = None
    payment: Optional[PaymentReceipt] = None
    receipt: Optional[HotelBookingReceipt] = None
    error: Optional[BookingError] = None


class PaymentSimulationError(RuntimeError):
    pass


class ConstraintViolation(ValueError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass(frozen=True)
class BookingContext:
    hotel_base: dict[str, Any]
    selected_hotel: dict[str, Any]
    mandate: BookingMandate
    idempotency_key: str
    nights: int
    estimated_total_sgd: int
    agent_payment_usd: Decimal
    network: str
    asset: str
    payer: str
    payee: str


def load_hotel_base_dict(path: Optional[str | Path] = None) -> dict[str, Any]:
    hotel_base_path = Path(path) if path is not None else Path(__file__).with_name("data") / "hotel_base_output.json"
    with hotel_base_path.open(encoding="utf-8") as fh:
        loaded = json.load(fh)
    if not isinstance(loaded, dict):
        raise ConstraintViolation("invalid_hotel_base", "Hotel-base payload must be a JSON object.")
    return loaded


def resolve_selected_hotel(hotel_base: dict[str, Any]) -> dict[str, Any]:
    selected_hotel_id = hotel_base.get("selected_hotel_id")
    candidates = hotel_base.get("hotel_candidates")
    if not isinstance(selected_hotel_id, str) or not selected_hotel_id:
        raise ConstraintViolation("selected_hotel_not_found", "Hotel-base payload does not name a selected hotel.")
    if not isinstance(candidates, list):
        raise ConstraintViolation("selected_hotel_not_found", "Hotel-base payload has no hotel candidates.")
    for candidate in candidates:
        if isinstance(candidate, dict) and candidate.get("id") == selected_hotel_id:
            return candidate
    raise ConstraintViolation("selected_hotel_not_found", f"Selected hotel {selected_hotel_id!r} was not found.")


def build_default_demo_mandate(
    hotel_base: dict[str, Any],
    trip_id: str = _DEFAULT_TRIP_ID,
) -> BookingMandate:
    selected_hotel = resolve_selected_hotel(hotel_base)
    payment_context = _payment_context(hotel_base)
    price_per_night = selected_hotel.get("price_per_night_sgd")
    if isinstance(price_per_night, int):
        max_total_sgd = max(price_per_night * 3 + 50, 650)
    else:
        max_total_sgd = 650
    mandate_id = f"ap2-demo-{trip_id}"
    return BookingMandate(
        mandate_id=mandate_id,
        mode="autonomous",
        allowed_action="mock_hotel_booking",
        city=str(selected_hotel.get("city") or "Osaka"),
        checkin=_DEFAULT_CHECKIN,
        checkout=_DEFAULT_CHECKOUT,
        guests=2,
        budget=str(selected_hotel.get("budget_tier") or "mid_range"),
        hotel_preferences=["near_station", "quiet", "near_convenience_store"],
        max_total_sgd=max_total_sgd,
        max_agent_payment_usd=_decimal_str(payment_context["agent_payment_usd"]),
        payment_protocol="x402",
        network=str(payment_context["network"]),
        expires_at=datetime(2030, 6, 10, tzinfo=timezone.utc),
        requires_user_visible_receipt=True,
        mock_booking_only=True,
    )


def deterministic_booking_id(
    trip_id: str,
    mandate_id: str,
    hotel_id: str,
    checkin: date,
    checkout: date,
    guests: int,
) -> str:
    digest = hashlib.sha1(
        f"{trip_id}|{mandate_id}|{hotel_id}|{checkin.isoformat()}|{checkout.isoformat()}|{guests}".encode()
    ).hexdigest()
    return f"TC-MOCK-HOTEL-{digest[:8].upper()}"


class X402SimulationAdapter:
    def __init__(self, simulate_failure: bool = False):
        self.simulate_failure = simulate_failure

    def create_payment_proof(
        self,
        request: HotelBookingRequest,
        instructions: PaymentInstructions,
    ) -> PaymentProof:
        if self.simulate_failure:
            raise PaymentSimulationError("x402 payment simulation failed")
        idempotency_key = _require_idempotency_key(request)
        tx_material = "|".join(
            [
                idempotency_key,
                request.trip_id,
                request.mandate.mandate_id if request.mandate else "",
                instructions.hotel_id,
                instructions.amount,
                instructions.network,
                instructions.payment_request_id,
            ]
        )
        tx_hash = "0xSIMULATED" + hashlib.sha1(tx_material.encode()).hexdigest().upper()[:24]
        return PaymentProof(
            network=instructions.network,
            asset=instructions.asset,
            amount=instructions.amount,
            payer=instructions.payer,
            payee=instructions.payee,
            hotel_id=instructions.hotel_id,
            payment_request_id=instructions.payment_request_id,
            idempotency_key=idempotency_key,
            tx_hash=tx_hash,
        )

    def validate_payment_proof(
        self,
        proof: PaymentProof,
        instructions: PaymentInstructions,
        idempotency_key: str,
    ) -> PaymentReceipt:
        expected_fields = {
            "network": instructions.network,
            "asset": instructions.asset,
            "amount": instructions.amount,
            "payer": instructions.payer,
            "payee": instructions.payee,
            "hotel_id": instructions.hotel_id,
            "payment_request_id": instructions.payment_request_id,
            "idempotency_key": idempotency_key,
        }
        for field_name, expected in expected_fields.items():
            if getattr(proof, field_name) != expected:
                raise ConstraintViolation(
                    "payment_proof_mismatch",
                    f"Payment proof {field_name} does not match the payment request.",
                )
        if not proof.tx_hash.startswith("0xSIMULATED"):
            raise ConstraintViolation("payment_proof_mismatch", "Payment proof is not a simulated x402 tx.")
        return PaymentReceipt(
            network=proof.network,
            asset=proof.asset,
            amount=proof.amount,
            payer=proof.payer,
            payee=proof.payee,
            tx_hash=proof.tx_hash,
        )


class AgenticHotelPaymentService:
    def __init__(self, payment_adapter: Optional[X402SimulationAdapter] = None):
        self.payment_adapter = payment_adapter or X402SimulationAdapter()

    def attempt_booking(
        self,
        request: HotelBookingRequest | dict[str, Any],
        payment_proof: Optional[PaymentProof] = None,
    ) -> HotelBookingResponse:
        try:
            normalized = self._normalize_request(request)
            context = self._build_context(normalized)
        except ConstraintViolation as exc:
            return _rejected(exc)

        instructions = _payment_instructions(context)
        if payment_proof is None:
            return HotelBookingResponse(
                status="payment_required",
                audit_events=[
                    AuditEvent(
                        type="mandate_validated",
                        message=(
                            "Mandate allows mock hotel booking within "
                            f"SGD {context.mandate.max_total_sgd}."
                        ),
                    ),
                    AuditEvent(
                        type="payment_required",
                        message=f"Hotel booking agent requires {instructions.amount} testnet {instructions.asset}.",
                    ),
                ],
                payment_required=instructions,
            )

        try:
            payment = self.payment_adapter.validate_payment_proof(
                payment_proof,
                instructions,
                context.idempotency_key,
            )
            receipt = _booking_receipt(normalized, context, payment)
        except ConstraintViolation as exc:
            return _rejected(exc)

        return HotelBookingResponse(
            status="mock_confirmed",
            audit_events=[
                AuditEvent(
                    type="mandate_validated",
                    message=(
                        "Mandate allows mock hotel booking within "
                        f"SGD {context.mandate.max_total_sgd}."
                    ),
                ),
                AuditEvent(type="booking_confirmed", message="Mock hotel booking receipt issued."),
            ],
            payment=payment,
            receipt=receipt,
        )

    def run_payment_loop(
        self,
        request: HotelBookingRequest | dict[str, Any],
    ) -> HotelBookingResponse:
        first_attempt = self.attempt_booking(request)
        if first_attempt.status != "payment_required" or first_attempt.payment_required is None:
            return first_attempt

        try:
            normalized = self._normalize_request(request)
            proof = self.payment_adapter.create_payment_proof(normalized, first_attempt.payment_required)
        except PaymentSimulationError:
            return HotelBookingResponse(
                status="payment_failed",
                audit_events=[
                    *first_attempt.audit_events,
                    AuditEvent(
                        type="payment_failed",
                        message="x402 payment simulation failed.",
                        simulated=True,
                    ),
                ],
                error=BookingError(
                    code="payment_simulation_failed",
                    message="x402 payment simulation failed before booking retry.",
                ),
            )
        except ConstraintViolation as exc:
            return _rejected(exc)

        retry = self.attempt_booking(normalized, payment_proof=proof)
        if retry.status != "mock_confirmed":
            return retry
        return retry.model_copy(
            update={
                "audit_events": [
                    *first_attempt.audit_events,
                    AuditEvent(
                        type="payment_completed",
                        message="x402 payment simulation completed.",
                        simulated=True,
                    ),
                    AuditEvent(type="booking_confirmed", message="Mock hotel booking receipt issued."),
                ]
            }
        )

    def _normalize_request(
        self,
        request: HotelBookingRequest | dict[str, Any],
    ) -> HotelBookingRequest:
        normalized = (
            request
            if isinstance(request, HotelBookingRequest)
            else HotelBookingRequest.model_validate(request)
        )
        hotel_base = normalized.hotel_base or load_hotel_base_dict()
        mandate = normalized.mandate or build_default_demo_mandate(hotel_base, normalized.trip_id)
        idempotency_key = normalized.idempotency_key
        if not idempotency_key:
            selected_hotel = resolve_selected_hotel(hotel_base)
            idempotency_key = f"{normalized.trip_id}:{mandate.mandate_id}:{selected_hotel['id']}"
        return normalized.model_copy(
            update={
                "hotel_base": hotel_base,
                "mandate": mandate,
                "idempotency_key": idempotency_key,
            }
        )

    def _build_context(self, request: HotelBookingRequest) -> BookingContext:
        _validate_environment()
        if request.hotel_base is None or request.mandate is None:
            raise ConstraintViolation("invalid_booking_request", "Booking request was not normalized.")

        selected_hotel = resolve_selected_hotel(request.hotel_base)
        mandate = request.mandate
        _validate_mandate(mandate)
        nights = (mandate.checkout - mandate.checkin).days
        if nights <= 0:
            raise ConstraintViolation("invalid_stay_dates", "Checkout must be after check-in.")

        if str(selected_hotel.get("city") or mandate.city) != mandate.city:
            raise ConstraintViolation("city_constraint_mismatch", "Selected hotel city violates the mandate.")
        if selected_hotel.get("budget_tier") and selected_hotel.get("budget_tier") != mandate.budget:
            raise ConstraintViolation("budget_constraint_mismatch", "Selected hotel budget tier violates the mandate.")

        price_per_night = selected_hotel.get("price_per_night_sgd")
        if not isinstance(price_per_night, int):
            raise ConstraintViolation(
                "selected_hotel_missing_price",
                "Selected hotel lacks price_per_night_sgd.",
            )
        rooms = selected_hotel.get("mock_available_rooms")
        if not isinstance(rooms, int) or rooms <= 0:
            raise ConstraintViolation("no_mock_rooms_available", "Selected hotel has no mock rooms available.")

        estimated_total_sgd = price_per_night * nights
        if estimated_total_sgd > mandate.max_total_sgd:
            raise ConstraintViolation(
                "stay_total_exceeds_mandate",
                f"Estimated stay total SGD {estimated_total_sgd} exceeds the mandate.",
            )

        payment_context = _payment_context(request.hotel_base)
        agent_payment_usd = _decimal(payment_context["agent_payment_usd"])
        if agent_payment_usd > mandate.max_agent_payment_usd:
            raise ConstraintViolation(
                "agent_payment_exceeds_mandate",
                "Agent payment amount exceeds the mandate.",
            )
        if str(payment_context["network"]) != mandate.network:
            raise ConstraintViolation("payment_network_mismatch", "Payment network violates the mandate.")
        if str(payment_context["payment_protocol"]) != mandate.payment_protocol:
            raise ConstraintViolation("payment_protocol_mismatch", "Payment protocol violates the mandate.")
        if payment_context.get("mock_booking_only") is not True:
            raise ConstraintViolation("mock_booking_required", "Hotel payment context must be mock-only.")

        return BookingContext(
            hotel_base=request.hotel_base,
            selected_hotel=selected_hotel,
            mandate=mandate,
            idempotency_key=_require_idempotency_key(request),
            nights=nights,
            estimated_total_sgd=estimated_total_sgd,
            agent_payment_usd=agent_payment_usd,
            network=str(payment_context["network"]),
            asset=str(payment_context["asset"]),
            payer=os.getenv("ORCHESTRATOR_WALLET_ADDRESS", _DEFAULT_PAYER),
            payee=os.getenv("HOTEL_AGENT_PAY_TO", _DEFAULT_PAYEE),
        )


def _validate_environment() -> None:
    booking_mode = os.getenv("HOTEL_BOOKING_MODE")
    if booking_mode and booking_mode != "mock":
        raise ConstraintViolation(
            "hotel_booking_mode_not_mock",
            "HOTEL_BOOKING_MODE must be unset or 'mock' for demo booking.",
        )
    x402_mode = os.getenv("X402_MODE", "simulation")
    if x402_mode != "simulation":
        raise ConstraintViolation("x402_mode_not_simulation", "Only x402 simulation mode is supported.")


def _validate_mandate(mandate: BookingMandate) -> None:
    if mandate.allowed_action != "mock_hotel_booking":
        raise ConstraintViolation(
            "mandate_action_not_allowed",
            "Mandate action must be mock_hotel_booking.",
        )
    if mandate.mock_booking_only is not True:
        raise ConstraintViolation("mock_booking_required", "Mandate must be mock-booking-only.")
    expires_at = mandate.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at <= datetime.now(timezone.utc):
        raise ConstraintViolation("mandate_expired", "Mandate is expired.")
    if mandate.payment_protocol != "x402":
        raise ConstraintViolation("payment_protocol_mismatch", "Mandate must use x402.")


def _payment_context(hotel_base: dict[str, Any]) -> dict[str, Any]:
    raw = hotel_base.get("payment_context")
    context = raw if isinstance(raw, dict) else {}
    return {
        "payment_protocol": context.get("payment_protocol", "x402"),
        "network": context.get("network", os.getenv("X402_NETWORK", _DEFAULT_NETWORK)),
        "asset": context.get("asset", _DEFAULT_ASSET),
        "agent_payment_usd": context.get(
            "agent_payment_usd",
            os.getenv("X402_HOTEL_BOOKING_PRICE_USD", str(_DEFAULT_AGENT_PAYMENT_USD)),
        ),
        "mock_booking_only": context.get("mock_booking_only", True),
    }


def _payment_instructions(context: BookingContext) -> PaymentInstructions:
    amount = _decimal_str(context.agent_payment_usd)
    request_material = "|".join(
        [
            context.idempotency_key,
            context.mandate.mandate_id,
            str(context.selected_hotel["id"]),
            amount,
            context.network,
        ]
    )
    payment_request_id = "x402_mock_" + hashlib.sha1(request_material.encode()).hexdigest()[:12]
    return PaymentInstructions(
        network=context.network,
        asset=context.asset,
        amount=amount,
        payer=context.payer,
        payee=context.payee,
        hotel_id=str(context.selected_hotel["id"]),
        payment_request_id=payment_request_id,
        message=f"Hotel booking agent requires {amount} testnet {context.asset}.",
    )


def _booking_receipt(
    request: HotelBookingRequest,
    context: BookingContext,
    payment: PaymentReceipt,
) -> HotelBookingReceipt:
    hotel = context.selected_hotel
    booking_id = deterministic_booking_id(
        request.trip_id,
        context.mandate.mandate_id,
        str(hotel["id"]),
        context.mandate.checkin,
        context.mandate.checkout,
        context.mandate.guests,
    )
    return HotelBookingReceipt(
        booking_id=booking_id,
        hotel={
            "id": hotel.get("id"),
            "name": hotel.get("name"),
            "area": hotel.get("area"),
            "city": hotel.get("city") or context.mandate.city,
            "lat": hotel.get("lat"),
            "lng": hotel.get("lng"),
            "room_type": hotel.get("room_type"),
            "cancellation_policy": hotel.get("cancellation_policy"),
        },
        stay={
            "checkin": context.mandate.checkin.isoformat(),
            "checkout": context.mandate.checkout.isoformat(),
            "nights": context.nights,
            "guests": context.mandate.guests,
        },
        pricing={
            "price_per_night_sgd": hotel.get("price_per_night_sgd"),
            "estimated_total_sgd": context.estimated_total_sgd,
            "agent_payment_usd": _decimal_str(context.agent_payment_usd),
        },
        payment=payment,
        mandate={
            "mandate_id": context.mandate.mandate_id,
            "allowed_action": context.mandate.allowed_action,
            "mock_booking_only": context.mandate.mock_booking_only,
        },
    )


def _rejected(exc: ConstraintViolation) -> HotelBookingResponse:
    return HotelBookingResponse(
        status="rejected",
        audit_events=[
            AuditEvent(
                type="booking_rejected",
                message=exc.message,
            )
        ],
        error=BookingError(code=exc.code, message=exc.message),
    )


def _require_idempotency_key(request: HotelBookingRequest) -> str:
    if request.idempotency_key is None:
        raise ConstraintViolation("missing_idempotency_key", "Booking request lacks an idempotency key.")
    return request.idempotency_key


def _decimal(value: Any) -> Decimal:
    return Decimal(str(value))


def _decimal_str(value: Any) -> str:
    return format(_decimal(value), "f")
