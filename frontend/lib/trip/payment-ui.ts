export type PaymentExplorerLink = {
  label: string;
  url: string;
  kind: "transaction" | "wallet";
};

const HASHKEY_TESTNET_EXPLORER = "https://testnet-explorer.hsk.xyz";

type PaymentLike = {
  network?: string;
  tx_hash?: string;
  status?: string;
  hsp?: {
    coordinator_url?: string;
    payment_id?: string | null;
    tx_hash?: string | null;
  } | null;
};

export function buildPaymentExplorerLinks({
  confirmed,
  payment,
}: {
  confirmed: boolean;
  payment?: PaymentLike | null;
}): PaymentExplorerLink[] {
  if (!confirmed) {
    return [];
  }

  const links: PaymentExplorerLink[] = [];
  const txUrl =
    getHashKeyTxUrl(payment?.tx_hash ?? payment?.hsp?.tx_hash, payment?.network) ||
    getBaseSepoliaTxUrl(payment?.tx_hash, payment?.network);
  if (txUrl) {
    links.push({
      label: "View transaction",
      url: txUrl,
      kind: "transaction",
    });
  }

  const hspReceiptUrl = getHspReceiptUrl(payment);
  if (hspReceiptUrl) {
    links.push({
      label: "HSP receipt",
      url: hspReceiptUrl,
      kind: "transaction",
    });
  }

  return links;
}

export function getBaseSepoliaTxUrl(txHash: string | null | undefined, network?: string) {
  if (!txHash || !isBaseSepoliaNetwork(network)) {
    return "";
  }

  if (!/^0x[0-9a-f]{64}$/i.test(txHash)) {
    return "";
  }

  return `https://sepolia.basescan.org/tx/${txHash}`;
}

function getHashKeyTxUrl(txHash: string | null | undefined, network?: string) {
  if (!txHash || !isHashKeyNetwork(network)) {
    return "";
  }

  if (!/^0x[0-9a-f]{64}$/i.test(txHash)) {
    return "";
  }

  return `${HASHKEY_TESTNET_EXPLORER}/tx/${txHash}`;
}

function getHspReceiptUrl(payment?: PaymentLike | null) {
  const coordinator = payment?.hsp?.coordinator_url?.replace(/\/+$/, "");
  const paymentId = payment?.hsp?.payment_id;
  if (!coordinator || !paymentId) {
    return "";
  }
  return `${coordinator}/explorer?paymentId=${encodeURIComponent(paymentId)}`;
}

function isBaseSepoliaNetwork(network: string | undefined) {
  return network === "base-sepolia" || network === "eip155:84532";
}

function isHashKeyNetwork(network: string | undefined) {
  return network === "hashkey-testnet" || network === "eip155:133";
}
