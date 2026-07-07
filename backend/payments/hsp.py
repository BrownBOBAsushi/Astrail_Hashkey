"""HashKey HSP testnet configuration and response models."""

from __future__ import annotations

import json
import os
import subprocess
import tempfile
from dataclasses import dataclass
from decimal import Decimal
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field


HASHKEY_TESTNET_CHAIN = "hashkey-testnet"
HASHKEY_TESTNET_CHAIN_ID = 133
HASHKEY_TESTNET_NETWORK = "eip155:133"
HASHKEY_TESTNET_EXPLORER = "https://testnet-explorer.hsk.xyz"
DEFAULT_HSP_COORDINATOR_URL = "https://hsp-hackathon.hashkeymerchant.com"
DEFAULT_HSP_FACILITATOR_URL = DEFAULT_HSP_COORDINATOR_URL + "/facilitator"
DEFAULT_HSP_ISSUER_URL = DEFAULT_HSP_COORDINATOR_URL + "/issuer"
DEFAULT_HSP_RPC_URL = "https://testnet.hsk.xyz"
DEFAULT_HSP_USDC_ADDRESS = "0x8FE3cB719Ee4410E236Cd6b72ab1fCDC06eF53c6"
DEFAULT_HSP_ADAPTER_ADDRESS = "0x467AaF355DF243379B961Ce00abBae20c1e25012"
HSP_USDC_DECIMALS = 6


_HSP_SDK_SCRIPT = r"""
import { readFileSync } from 'node:fs';
import { HSPClient } from '@hsp/sdk';
import { resolveChain } from '@hsp/core/chains/index';
import { getAddress } from 'viem';

const payloadPath = process.env.TRIPCANVAS_HSP_PAYLOAD_PATH;
if (!payloadPath) {
  throw new Error('TRIPCANVAS_HSP_PAYLOAD_PATH is required');
}
const input = JSON.parse(readFileSync(payloadPath, 'utf8'));

function emit(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

try {
  const chain = resolveChain(input.chain, {
    rpcUrl: input.rpc_url,
    stablecoin: {
      address: getAddress(input.usdc_address),
      symbol: 'USDC',
      decimals: 6,
    },
  });
  const hsp = new HSPClient({
    coordinatorUrl: input.coordinator_url,
    apiKey: input.api_key,
    signer: { kind: 'privateKey', privateKey: input.private_key },
    chain,
    issuerUrl: input.issuer_url,
  });

  const expectedPayer = getAddress(input.payer_address);
  if (getAddress(hsp.address) !== expectedPayer) {
    throw new Error(`HSP_PAYER_ADDRESS ${expectedPayer} does not match HSP_PRIVATE_KEY signer ${hsp.address}`);
  }

  const handle = await hsp.payX402({
    merchant: getAddress(input.payee_address),
    facilitatorUrl: input.facilitator_url,
    amount: BigInt(input.amount_base_units),
    token: getAddress(input.usdc_address),
  });
  const snapshot = await handle.awaitSettled({
    timeoutMs: input.await_timeout_ms,
    pollMs: 2000,
  });
  emit({
    ok: true,
    payment_id: handle.paymentId,
    status: snapshot.status ?? handle.status,
    outcome_class:
      snapshot.outcomeClass ??
      snapshot.lastDecision?.outcomeClass ??
      snapshot.decision?.outcomeClass ??
      (snapshot.status === 'SETTLED' ? 'ACCEPT' : null),
    tx_hash: handle.txHash,
  });
} catch (error) {
  emit({
    ok: false,
    code: 'hsp_sdk_payment_failed',
    message: error instanceof Error ? error.message : String(error),
  });
}
"""


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
    rpc_url: str
    sdk_path: str
    payer_address: str
    payee_address: str
    usdc_address: str
    adapter_address: str
    payment_amount_usdc: Decimal
    await_settled_timeout_ms: int

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
            rpc_url=os.getenv("HSP_RPC_URL", DEFAULT_HSP_RPC_URL).strip(),
            sdk_path=_path_env("HSP_SDK_PATH"),
            payer_address=required["HSP_PAYER_ADDRESS"],
            payee_address=required["HSP_PAYEE_ADDRESS"],
            usdc_address=required["HSP_USDC_ADDRESS"],
            adapter_address=required["HSP_ADAPTER_ADDRESS"],
            payment_amount_usdc=Decimal(os.getenv("HSP_PAYMENT_AMOUNT_USDC", "0.01")),
            await_settled_timeout_ms=_positive_int_env("HSP_AWAIT_SETTLED_TIMEOUT_MS", 120_000),
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


class HSPSdkRunner:
    """Runs the official TypeScript HSP SDK from a local hackathon repo clone."""

    def run_pay_x402(self, payload: dict[str, Any]) -> dict[str, Any]:
        sdk_path = Path(_normalize_env_path(str(payload["sdk_path"]))).expanduser()
        if not str(sdk_path).strip():
            return _hsp_sdk_missing()
        if not sdk_path.exists():
            return {
                "ok": False,
                "code": "hsp_sdk_missing",
                "message": f"HSP_SDK_PATH does not exist: {sdk_path}",
            }
        tsx = _tsx_bin(sdk_path)
        if tsx is None:
            return {
                "ok": False,
                "code": "hsp_sdk_not_installed",
                "message": (
                    "HSP_SDK_PATH must point to a cloned https://github.com/project-hsp/hsp "
                    "repo with npm install already run."
                ),
            }
        payload_path = _write_payload_file(payload)
        script_path = _write_script_file(sdk_path)
        try:
            try:
                completed = subprocess.run(
                    [str(tsx), str(script_path)],
                    cwd=sdk_path,
                    stdin=subprocess.DEVNULL,
                    text=True,
                    capture_output=True,
                    timeout=max(30, int(payload["await_timeout_ms"] / 1000) + 90),
                    check=False,
                    env=_hsp_runner_env(payload_path),
                )
            except subprocess.TimeoutExpired:
                return {
                    "ok": False,
                    "code": "hsp_sdk_timeout",
                    "message": "HashKey HSP SDK payment timed out.",
                }
        finally:
            payload_path.unlink(missing_ok=True)
            script_path.unlink(missing_ok=True)
        if completed.returncode != 0:
            return {
                "ok": False,
                "code": "hsp_sdk_failed",
                "message": _safe_process_error(completed.stderr, completed.stdout, payload),
            }
        try:
            return _last_json_line(completed.stdout)
        except ValueError as exc:
            return {
                "ok": False,
                "code": "hsp_sdk_bad_output",
                "message": str(exc),
            }


class HSPClient:
    def __init__(self, *, runner: Any | None = None):
        self.runner = runner or HSPSdkRunner()

    def pay_x402(self, *, config: HSPConfig, instructions: Any, idempotency_key: str) -> dict[str, Any]:
        if not config.sdk_path:
            return _hsp_sdk_missing()
        payload = {
            "chain": config.chain,
            "idempotency_key": idempotency_key,
            "coordinator_url": config.coordinator_url,
            "facilitator_url": config.facilitator_url,
            "issuer_url": config.issuer_url,
            "rpc_url": config.rpc_url,
            "api_key": config.api_key,
            "private_key": config.private_key,
            "sdk_path": config.sdk_path,
            "payer_address": config.payer_address,
            "payee_address": config.payee_address,
            "usdc_address": config.usdc_address,
            "amount_base_units": str(_usdc_base_units(config.payment_amount_usdc)),
            "amount_usdc": str(config.payment_amount_usdc),
            "hotel_id": instructions.hotel_id,
            "payment_request_id": instructions.payment_request_id,
            "await_timeout_ms": config.await_settled_timeout_ms,
        }
        return self.runner.run_pay_x402(payload)


def _usdc_base_units(amount: Decimal) -> int:
    return int(amount * (Decimal(10) ** HSP_USDC_DECIMALS))


def _positive_int_env(name: str, default: int) -> int:
    raw = os.getenv(name, "").strip()
    if not raw:
        return default
    try:
        return max(1, int(raw))
    except ValueError:
        return default


def _path_env(name: str) -> str:
    return _normalize_env_path(os.getenv(name, "").strip())


def _normalize_env_path(value: str) -> str:
    return value.replace("\t", r"\t")


def _hsp_sdk_missing() -> dict[str, Any]:
    return {
        "ok": False,
        "code": "hsp_sdk_missing",
        "message": (
            "HSP_SDK_PATH is required for X402_MODE=hsp_testnet. "
            "Clone https://github.com/project-hsp/hsp, run npm install there, "
            "and set HSP_SDK_PATH to that local folder."
        ),
    }


def _write_payload_file(payload: dict[str, Any]) -> Path:
    with tempfile.NamedTemporaryFile(
        "w",
        delete=False,
        encoding="utf-8",
        prefix="tripcanvas-hsp-",
        suffix=".json",
    ) as fh:
        json.dump(payload, fh, separators=(",", ":"))
        return Path(fh.name)


def _write_script_file(sdk_path: Path) -> Path:
    with tempfile.NamedTemporaryFile(
        "w",
        delete=False,
        encoding="utf-8",
        prefix="tripcanvas-hsp-runner-",
        suffix=".mjs",
        dir=sdk_path,
    ) as fh:
        fh.write(_HSP_SDK_SCRIPT)
        return Path(fh.name)


def _hsp_runner_env(payload_path: Path) -> dict[str, str]:
    env = os.environ.copy()
    env["TRIPCANVAS_HSP_PAYLOAD_PATH"] = str(payload_path)
    return env


def _tsx_bin(sdk_path: Path) -> Path | None:
    if os.name == "nt":
        candidate = sdk_path / "node_modules" / ".bin" / "tsx.cmd"
    else:
        candidate = sdk_path / "node_modules" / ".bin" / "tsx"
    return candidate if candidate.exists() else None


def _last_json_line(stdout: str) -> dict[str, Any]:
    lines = [line.strip() for line in stdout.splitlines() if line.strip()]
    for line in reversed(lines):
        if not line.startswith("{"):
            continue
        loaded = json.loads(line)
        if isinstance(loaded, dict):
            return loaded
    raise ValueError("HashKey HSP SDK produced no JSON output.")


def _safe_process_error(stderr: str, stdout: str, payload: dict[str, Any]) -> str:
    text = (stderr or stdout or "HashKey HSP SDK process failed.").strip()
    for key in ("private_key", "api_key"):
        secret = str(payload.get(key) or "")
        if secret:
            text = text.replace(secret, "[redacted]")
    return text[:600]
