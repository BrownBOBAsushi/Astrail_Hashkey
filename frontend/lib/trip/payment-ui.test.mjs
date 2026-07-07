import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function importPaymentUiModule() {
  const source = await readFile(new URL("./payment-ui.ts", import.meta.url), "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const encoded = Buffer.from(transpiled).toString("base64");

  return import(`data:text/javascript;base64,${encoded}#${Date.now()}`);
}

const paymentUi = await importPaymentUiModule();

test("buildPaymentExplorerLinks always exposes the demo wallet addresses after confirmation", () => {
  const links = paymentUi.buildPaymentExplorerLinks({
    confirmed: true,
    payment: {
      network: "base-sepolia",
      tx_hash: "0xSIMULATED1234567890",
      status: "simulated",
    },
  });

  assert.deepEqual(
    links.map((link) => [link.label, link.url]),
    [
      [
        "Orchestrator wallet",
        "https://sepolia.basescan.org/address/0x407F9c97a9CE80a9fa95765c861BC6dfe8eBEDD4#tokentxns",
      ],
      [
        "Hotel Agent wallet",
        "https://sepolia.basescan.org/address/0x009e5eC03b638194DF3F10f158d311883cBFE5B7#tokentxns",
      ],
    ],
  );
});

test("buildPaymentExplorerLinks includes a transaction link for real Base Sepolia tx hashes", () => {
  const txHash = `0x${"a".repeat(64)}`;
  const links = paymentUi.buildPaymentExplorerLinks({
    confirmed: true,
    payment: {
      network: "base-sepolia",
      tx_hash: txHash,
      status: "settled",
    },
  });

  assert.deepEqual(links[0], {
    label: "View transaction",
    url: `https://sepolia.basescan.org/tx/${txHash}`,
    kind: "transaction",
  });
  assert.equal(links.length, 3);
});

test("buildPaymentExplorerLinks treats eip155:84532 as Base Sepolia", () => {
  const txHash = `0x${"b".repeat(64)}`;
  const links = paymentUi.buildPaymentExplorerLinks({
    confirmed: true,
    payment: {
      network: "eip155:84532",
      tx_hash: txHash,
      status: "settled",
    },
  });

  assert.equal(links[0].url, `https://sepolia.basescan.org/tx/${txHash}`);
});

test("buildPaymentExplorerLinks supports HashKey testnet payment metadata", () => {
  const links = paymentUi.buildPaymentExplorerLinks({
    confirmed: true,
    payment: {
      network: "hashkey-testnet",
      tx_hash: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd",
      status: "settled",
      hsp: {
        coordinator_url: "https://hsp-hackathon.hashkeymerchant.com",
        chain: "hashkey-testnet",
        chain_id: 133,
        payment_id: "0xHSPPAYMENT",
        status: "SETTLED",
        outcome_class: "ACCEPT",
        tx_hash: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd",
      },
    },
  });

  assert.equal(
    links.find((link) => link.label === "View transaction")?.url,
    "https://testnet-explorer.hsk.xyz/tx/0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd",
  );
  assert.equal(
    links.find((link) => link.label === "HSP receipt")?.url,
    "https://hsp-hackathon.hashkeymerchant.com/explorer?paymentId=0xHSPPAYMENT",
  );
});

test("buildPaymentExplorerLinks stays empty before user-approved booking confirmation", () => {
  assert.deepEqual(
    paymentUi.buildPaymentExplorerLinks({
      confirmed: false,
      payment: { network: "base-sepolia" },
    }),
    [],
  );
});
