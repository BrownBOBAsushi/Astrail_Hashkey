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


if __name__ == "__main__":
    unittest.main()
