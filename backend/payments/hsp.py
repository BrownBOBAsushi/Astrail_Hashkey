"""HashKey HSP testnet configuration and response models."""

from __future__ import annotations

import os
from dataclasses import dataclass
from decimal import Decimal
from typing import Any

import httpx
from pydantic import BaseModel, Field


HASHKEY_TESTNET_CHAIN = "hashkey-testnet"
HASHKEY_TESTNET_CHAIN_ID = 133
HASHKEY_TESTNET_NETWORK = "eip155:133"
HASHKEY_TESTNET_EXPLORER = "https://testnet-explorer.hsk.xyz"
DEFAULT_HSP_COORDINATOR_URL = "https://hsp-hackathon.hashkeymerchant.com"
DEFAULT_HSP_FACILITATOR_URL = DEFAULT_HSP_COORDINATOR_URL + "/facilitator"
DEFAULT_HSP_ISSUER_URL = DEFAULT_HSP_COORDINATOR_URL + "/issuer"
DEFAULT_HSP_USDC_ADDRESS = "0x8FE3cB719Ee4410E236Cd6b72ab1fCDC06eF53c6"
DEFAULT_HSP_ADAPTER_ADDRESS = "0x467AaF355DF243379B961Ce00abBae20c1e25012"


class HSPConfigError(RuntimeError):
    def __init__(self, missing: list[str]):
        self.code = "hsp_config_missing"
        self.missing = missing
        super().__init__("Missing HashKey HSP env vars: " + ", ".join(missing))


@dataclass(frozen=True)
class HSPConfig:
    coordinator_url: str
    api_key: str
    private_key: str
    chain: str
    chain_id: int
    network: str
    facilitator_url: str
    issuer_url: str
    payer_address: str
    payee_address: str
    usdc_address: str
    adapter_address: str
    payment_amount_usdc: Decimal

    @classmethod
    def from_env(cls) -> "HSPConfig":
        required = {
            "HSP_COORDINATOR_URL": os.getenv("HSP_COORDINATOR_URL", "").strip(),
            "HSP_API_KEY": os.getenv("HSP_API_KEY", "").strip(),
            "HSP_PRIVATE_KEY": os.getenv("HSP_PRIVATE_KEY", "").strip(),
            "HSP_CHAIN": os.getenv("HSP_CHAIN", "").strip(),
            "HSP_FACILITATOR_URL": os.getenv("HSP_FACILITATOR_URL", "").strip(),
            "HSP_PAYER_ADDRESS": os.getenv("HSP_PAYER_ADDRESS", "").strip(),
            "HSP_PAYEE_ADDRESS": os.getenv("HSP_PAYEE_ADDRESS", "").strip(),
            "HSP_USDC_ADDRESS": os.getenv("HSP_USDC_ADDRESS", "").strip(),
            "HSP_ADAPTER_ADDRESS": os.getenv("HSP_ADAPTER_ADDRESS", "").strip(),
        }
        missing = [key for key, value in required.items() if not value]
        if missing:
            raise HSPConfigError(missing)
        chain = required["HSP_CHAIN"]
        if chain != HASHKEY_TESTNET_CHAIN:
            raise HSPConfigError(["HSP_CHAIN=hashkey-testnet"])
        return cls(
            coordinator_url=required["HSP_COORDINATOR_URL"].rstrip("/"),
            api_key=required["HSP_API_KEY"],
            private_key=required["HSP_PRIVATE_KEY"],
            chain=chain,
            chain_id=HASHKEY_TESTNET_CHAIN_ID,
            network=HASHKEY_TESTNET_NETWORK,
            facilitator_url=required["HSP_FACILITATOR_URL"].rstrip("/"),
            issuer_url=os.getenv("HSP_ISSUER_URL", DEFAULT_HSP_ISSUER_URL).strip().rstrip("/"),
            payer_address=required["HSP_PAYER_ADDRESS"],
            payee_address=required["HSP_PAYEE_ADDRESS"],
            usdc_address=required["HSP_USDC_ADDRESS"],
            adapter_address=required["HSP_ADAPTER_ADDRESS"],
            payment_amount_usdc=Decimal(os.getenv("HSP_PAYMENT_AMOUNT_USDC", "0.01")),
        )


class HSPReceiptSummary(BaseModel):
    coordinator_url: str
    chain: str
    chain_id: int
    payment_id: str | None = None
    status: str
    outcome_class: str | None = None
    tx_hash: str | None = None
    adapter_address: str | None = None
    simulated: bool = False
    extra: dict[str, Any] = Field(default_factory=dict)

    @property
    def explorer_url(self) -> str | None:
        if not self.tx_hash:
            return None
        return f"{HASHKEY_TESTNET_EXPLORER}/tx/{self.tx_hash}"

    @property
    def hsp_explorer_url(self) -> str | None:
        if not self.payment_id:
            return None
        return f"{self.coordinator_url.rstrip('/')}/explorer?paymentId={self.payment_id}"


class HTTPXTransport:
    def post(self, path: str, *, headers: dict[str, str], json: dict[str, Any], timeout: float):
        with httpx.Client(timeout=timeout) as client:
            response = client.post(path, headers=headers, json=json)
            try:
                payload = response.json()
            except ValueError:
                payload = {"ok": False, "error": response.text[:300]}
            if response.status_code >= 400:
                return {
                    "ok": False,
                    "code": "hsp_network_error",
                    "message": str(payload.get("error") or payload),
                }
            return payload


class HSPClient:
    def __init__(self, *, transport: Any | None = None):
        self.transport = transport or HTTPXTransport()

    def pay_x402(self, *, config: HSPConfig, instructions: Any, idempotency_key: str) -> dict[str, Any]:
        headers = {
            "Authorization": f"Bearer {config.api_key}",
            "Content-Type": "application/json",
        }
        body = {
            "chain": config.chain,
            "idempotency_key": idempotency_key,
            "payer": config.payer_address,
            "payee": config.payee_address,
            "token": config.usdc_address,
            "amount": str(config.payment_amount_usdc),
            "hotel_id": instructions.hotel_id,
            "payment_request_id": instructions.payment_request_id,
            "facilitator_url": config.facilitator_url,
        }
        return self.transport.post(
            config.coordinator_url + "/payments",
            headers=headers,
            json=body,
            timeout=30,
        )
