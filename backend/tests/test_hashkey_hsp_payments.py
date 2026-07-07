import os
import unittest
from unittest.mock import patch

from backend.payments.hsp import HSPConfig, HSPConfigError, HSPReceiptSummary


class HashKeyHSPConfigTests(unittest.TestCase):
    def test_config_requires_secret_values_in_hsp_testnet_mode(self):
        with patch.dict(os.environ, {"X402_MODE": "hsp_testnet"}, clear=True):
            with self.assertRaises(HSPConfigError) as ctx:
                HSPConfig.from_env()

        self.assertEqual(ctx.exception.code, "hsp_config_missing")
        self.assertIn("HSP_COORDINATOR_URL", ctx.exception.missing)
        self.assertIn("HSP_API_KEY", ctx.exception.missing)
        self.assertIn("HSP_PRIVATE_KEY", ctx.exception.missing)

    def test_config_loads_hashkey_testnet_values(self):
        env = {
            "X402_MODE": "hsp_testnet",
            "HSP_COORDINATOR_URL": "https://hsp-hackathon.hashkeymerchant.com",
            "HSP_API_KEY": "test-api-key",
            "HSP_PRIVATE_KEY": "0x" + "1" * 64,
            "HSP_CHAIN": "hashkey-testnet",
            "HSP_FACILITATOR_URL": "https://hsp-hackathon.hashkeymerchant.com/facilitator",
            "HSP_PAYER_ADDRESS": "0x10252A4a30ea30D179678C7C4f7a452321945E30",
            "HSP_PAYEE_ADDRESS": "0x2222222222222222222222222222222222222222",
            "HSP_USDC_ADDRESS": "0x8FE3cB719Ee4410E236Cd6b72ab1fCDC06eF53c6",
            "HSP_ADAPTER_ADDRESS": "0x467AaF355DF243379B961Ce00abBae20c1e25012",
        }
        with patch.dict(os.environ, env, clear=True):
            config = HSPConfig.from_env()

        self.assertEqual(config.chain, "hashkey-testnet")
        self.assertEqual(config.chain_id, 133)
        self.assertEqual(config.network, "eip155:133")
        self.assertEqual(config.usdc_address, "0x8FE3cB719Ee4410E236Cd6b72ab1fCDC06eF53c6")

    def test_receipt_summary_builds_links(self):
        summary = HSPReceiptSummary(
            coordinator_url="https://hsp-hackathon.hashkeymerchant.com",
            chain="hashkey-testnet",
            chain_id=133,
            payment_id="0xabc",
            status="SETTLED",
            outcome_class="ACCEPT",
            tx_hash="0x" + "a" * 64,
            adapter_address="0x467AaF355DF243379B961Ce00abBae20c1e25012",
        )

        self.assertEqual(
            summary.explorer_url,
            "https://testnet-explorer.hsk.xyz/tx/0x" + "a" * 64,
        )
        self.assertEqual(
            summary.hsp_explorer_url,
            "https://hsp-hackathon.hashkeymerchant.com/explorer?paymentId=0xabc",
        )

    def test_payment_receipt_accepts_hsp_metadata(self):
        from backend.payments.service import PaymentReceipt

        receipt = PaymentReceipt(
            protocol="x402",
            network="hashkey-testnet",
            asset="USDC",
            amount="0.01",
            payer="0x10252A4a30ea30D179678C7C4f7a452321945E30",
            payee="0x2222222222222222222222222222222222222222",
            tx_hash="0x" + "b" * 64,
            status="settled",
            hsp=HSPReceiptSummary(
                coordinator_url="https://hsp-hackathon.hashkeymerchant.com",
                chain="hashkey-testnet",
                chain_id=133,
                payment_id="0xpayment",
                status="SETTLED",
                outcome_class="ACCEPT",
                tx_hash="0x" + "b" * 64,
                adapter_address="0x467AaF355DF243379B961Ce00abBae20c1e25012",
            ),
        )

        dumped = receipt.model_dump()
        self.assertEqual(dumped["hsp"]["chain"], "hashkey-testnet")
        self.assertEqual(dumped["hsp"]["status"], "SETTLED")


class HashKeyHSPAdapterSelectionTests(unittest.TestCase):
    def test_hsp_mode_selects_hsp_adapter(self):
        from backend.payments.service import HSPX402Adapter, build_x402_payment_adapter

        env = {
            "X402_MODE": "hsp_testnet",
            "HSP_COORDINATOR_URL": "https://hsp-hackathon.hashkeymerchant.com",
            "HSP_API_KEY": "test-api-key",
            "HSP_PRIVATE_KEY": "0x" + "1" * 64,
            "HSP_CHAIN": "hashkey-testnet",
            "HSP_FACILITATOR_URL": "https://hsp-hackathon.hashkeymerchant.com/facilitator",
            "HSP_PAYER_ADDRESS": "0x10252A4a30ea30D179678C7C4f7a452321945E30",
            "HSP_PAYEE_ADDRESS": "0x2222222222222222222222222222222222222222",
            "HSP_USDC_ADDRESS": "0x8FE3cB719Ee4410E236Cd6b72ab1fCDC06eF53c6",
            "HSP_ADAPTER_ADDRESS": "0x467AaF355DF243379B961Ce00abBae20c1e25012",
        }
        with patch.dict(os.environ, env, clear=True):
            adapter = build_x402_payment_adapter()

        self.assertIsInstance(adapter, HSPX402Adapter)

    def test_hsp_mode_missing_config_returns_payment_failed(self):
        from backend.payments.service import AgenticHotelPaymentService
        from backend.tests.test_agentic_hotel_payments import demo_request

        with patch.dict(os.environ, {"X402_MODE": "hsp_testnet"}, clear=True):
            response = AgenticHotelPaymentService().run_payment_loop(demo_request())

        self.assertEqual(response.status, "payment_failed")
        self.assertEqual(response.error.code, "hsp_config_missing")
        self.assertIsNone(response.receipt)


class FakeHSPClient:
    def __init__(self, *, fail: bool = False):
        self.fail = fail
        self.calls = []

    def pay_x402(self, *, config, instructions, idempotency_key):
        self.calls.append((config, instructions, idempotency_key))
        if self.fail:
            return {
                "ok": False,
                "code": "hsp_payment_rejected",
                "message": "Coordinator rejected payment.",
            }
        return {
            "ok": True,
            "payment_id": "0xHSPPAYMENT",
            "status": "SETTLED",
            "outcome_class": "ACCEPT",
            "tx_hash": "0x" + "c" * 64,
        }


class HashKeyHSPAdapterPaymentTests(unittest.TestCase):
    def _config(self):
        return HSPConfig(
            coordinator_url="https://hsp-hackathon.hashkeymerchant.com",
            api_key="test-api-key",
            private_key="0x" + "1" * 64,
            chain="hashkey-testnet",
            chain_id=133,
            network="eip155:133",
            facilitator_url="https://hsp-hackathon.hashkeymerchant.com/facilitator",
            issuer_url="https://hsp-hackathon.hashkeymerchant.com/issuer",
            payer_address="0x10252A4a30ea30D179678C7C4f7a452321945E30",
            payee_address="0x2222222222222222222222222222222222222222",
            usdc_address="0x8FE3cB719Ee4410E236Cd6b72ab1fCDC06eF53c6",
            adapter_address="0x467AaF355DF243379B961Ce00abBae20c1e25012",
            payment_amount_usdc=__import__("decimal").Decimal("0.01"),
        )

    def test_hsp_adapter_success_returns_settled_hashkey_receipt(self):
        from backend.payments.service import AgenticHotelPaymentService, HSPX402Adapter
        from backend.tests.test_agentic_hotel_payments import demo_request

        adapter = HSPX402Adapter(config=self._config(), hsp_client=FakeHSPClient())
        response = AgenticHotelPaymentService(payment_adapter=adapter).run_payment_loop(
            demo_request(mandate=__import__("backend.tests.test_agentic_hotel_payments", fromlist=["demo_mandate"]).demo_mandate(network="hashkey-testnet"))
        )

        self.assertEqual(response.status, "mock_confirmed")
        self.assertEqual(response.payment.status, "settled")
        self.assertEqual(response.payment.network, "hashkey-testnet")
        self.assertEqual(response.payment.hsp.status, "SETTLED")
        self.assertEqual(response.payment.hsp.outcome_class, "ACCEPT")
        self.assertEqual(response.payment.hsp.chain_id, 133)

    def test_hsp_adapter_failure_returns_payment_failed(self):
        from backend.payments.service import AgenticHotelPaymentService, HSPX402Adapter
        from backend.tests.test_agentic_hotel_payments import demo_mandate, demo_request

        adapter = HSPX402Adapter(config=self._config(), hsp_client=FakeHSPClient(fail=True))
        response = AgenticHotelPaymentService(payment_adapter=adapter).run_payment_loop(
            demo_request(mandate=demo_mandate(network="hashkey-testnet"))
        )

        self.assertEqual(response.status, "payment_failed")
        self.assertEqual(response.error.code, "hsp_payment_rejected")
        self.assertIsNone(response.receipt)


if __name__ == "__main__":
    unittest.main()
