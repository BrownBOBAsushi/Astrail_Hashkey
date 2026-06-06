export type PaymentExplorerLink = {
  label: string;
  url: string;
  kind: "transaction" | "wallet";
};

export const ORCHESTRATOR_WALLET_URL =
  "https://sepolia.basescan.org/address/0x407F9c97a9CE80a9fa95765c861BC6dfe8eBEDD4#tokentxns";

export const HOTEL_AGENT_WALLET_URL =
  "https://sepolia.basescan.org/address/0x009e5eC03b638194DF3F10f158d311883cBFE5B7#tokentxns";

export function buildPaymentExplorerLinks({
  confirmed,
  payment,
}: {
  confirmed: boolean;
  payment?: {
    network?: string;
    tx_hash?: string;
    status?: string;
  } | null;
}): PaymentExplorerLink[] {
  if (!confirmed) {
    return [];
  }

  const links: PaymentExplorerLink[] = [];
  const txUrl = getBaseSepoliaTxUrl(payment?.tx_hash, payment?.network);
  if (txUrl) {
    links.push({
      label: "View transaction",
      url: txUrl,
      kind: "transaction",
    });
  }

  links.push(
    {
      label: "Orchestrator wallet",
      url: ORCHESTRATOR_WALLET_URL,
      kind: "wallet",
    },
    {
      label: "Hotel Agent wallet",
      url: HOTEL_AGENT_WALLET_URL,
      kind: "wallet",
    },
  );

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

function isBaseSepoliaNetwork(network: string | undefined) {
  return network === "base-sepolia" || network === "eip155:84532";
}
