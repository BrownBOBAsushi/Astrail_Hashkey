import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function importBookingFlowModule() {
  const source = await readFile(new URL("./booking-flow.ts", import.meta.url), "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText.replace(/import .*backend-types.*;\n/g, "");
  const encoded = Buffer.from(transpiled).toString("base64");

  return import(`data:text/javascript;base64,${encoded}#${Date.now()}`);
}

const bookingFlow = await importBookingFlowModule();

test("booking flow labels expose the AP2 and x402 states", () => {
  assert.equal(bookingFlow.getBookingFlowLabel("idle"), "Ready");
  assert.equal(bookingFlow.getBookingFlowLabel("mandate_ready"), "Mandate ready");
  assert.equal(bookingFlow.getBookingFlowLabel("booking_submitting"), "Paying");
});

test("formatStayLabel includes nights and guests when backend provides them", () => {
  assert.equal(
    bookingFlow.formatStayLabel({
      checkin: "2026-06-10",
      checkout: "2026-06-13",
      nights: 3,
      guests: 2,
    }),
    "2026-06-10 to 2026-06-13 (3 nights, 2 guests)",
  );
});

test("payment labels preserve protocol, amount, network, and status", () => {
  assert.equal(
    bookingFlow.formatPaymentLabel({
      protocol: "x402",
      amount: "0.01",
      asset: "USDC",
      network: "base-sepolia",
      status: "simulated",
    }),
    "x402 0.01 USDC on base-sepolia (simulated)",
  );
});

test("formatPaymentLabel names HashKey HSP x402 rail", () => {
  assert.equal(
    bookingFlow.formatPaymentLabel({
      protocol: "x402",
      amount: "0.01",
      asset: "USDC",
      network: "hashkey-testnet",
      status: "settled",
      hsp: { status: "SETTLED", outcome_class: "ACCEPT" },
    }),
    "HashKey HSP x402 0.01 USDC on hashkey-testnet (settled)",
  );
});

test("transaction hashes are shortened only when long", () => {
  assert.equal(bookingFlow.formatTxHash("0xabc"), "0xabc");
  assert.equal(
    bookingFlow.formatTxHash("0x1234567890abcdef123456"),
    "0x12345678...ef123456",
  );
});
