import type {
  AP2MandateResponse,
  HotelBookingResponse,
} from "@/lib/trip/backend-types";

export type BookingFlowStatus =
  | "idle"
  | "mandate_signing"
  | "mandate_ready"
  | "booking_submitting"
  | "confirmed"
  | "rejected"
  | "failed";

export type BookingFlowState = {
  status: BookingFlowStatus;
  mandateResponse: AP2MandateResponse | null;
  bookingResponse: HotelBookingResponse | null;
  errorMessage: string | null;
};

export const INITIAL_BOOKING_FLOW_STATE: BookingFlowState = {
  status: "idle",
  mandateResponse: null,
  bookingResponse: null,
  errorMessage: null,
};

export function buildMandateLogDetail(response: AP2MandateResponse) {
  const mandateId = response.ap2?.mandate_id ?? "demo mandate";
  const hotelName = response.preview?.hotel?.name ?? "the canonical demo hotel";
  const payment = response.preview?.payment;
  const paymentText =
    payment?.amount && payment.asset
      ? `${payment.amount} ${payment.asset}`
      : "x402 payment";
  const networkText = payment?.network ? ` on ${payment.network}` : "";

  return `${mandateId} signed for ${hotelName}; ${paymentText}${networkText}.`;
}

export function buildBookingLogDetail(response: HotelBookingResponse) {
  const bookingId = response.receipt?.booking_id ?? "hotel booking";
  const paymentStatus = response.payment?.status ?? response.receipt?.payment?.status;
  const statusText = paymentStatus ? ` Payment ${paymentStatus}.` : "";

  return `${bookingId} receipt issued.${statusText}`;
}

export function getBookingFlowLabel(status: BookingFlowStatus) {
  const labels: Record<BookingFlowStatus, string> = {
    idle: "Ready",
    mandate_signing: "Signing",
    mandate_ready: "Mandate ready",
    booking_submitting: "Paying",
    confirmed: "Confirmed",
    rejected: "Rejected",
    failed: "Failed",
  };

  return labels[status];
}

export function formatStayLabel(
  stay:
    | {
        checkin?: string;
        checkout?: string;
        nights?: number;
        guests?: number;
      }
    | null
    | undefined,
) {
  if (!stay?.checkin || !stay.checkout) {
    return "Backend preview pending";
  }

  const guestText = typeof stay.guests === "number" ? `, ${stay.guests} guests` : "";
  const nightsText = typeof stay.nights === "number" ? ` (${stay.nights} nights${guestText})` : "";

  return `${stay.checkin} to ${stay.checkout}${nightsText}`;
}

export function formatSgdAmount(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? `SGD ${value.toLocaleString("en-SG")}`
    : "Backend estimate pending";
}

export function formatPaymentLabel(
  payment:
    | {
        protocol?: string;
        network?: string;
        asset?: string;
        amount?: string;
        status?: string;
        hsp?: unknown;
      }
    | null
    | undefined,
) {
  if (!payment) {
    return "x402 terms pending";
  }

  const isHashKeyHsp =
    payment.network === "hashkey-testnet" ||
    payment.network === "eip155:133" ||
    Boolean(payment.hsp);
  const protocol = isHashKeyHsp ? "HashKey HSP x402" : payment.protocol ?? "x402";
  const amount = [payment.amount, payment.asset].filter(Boolean).join(" ");
  const network = payment.network ? ` on ${payment.network}` : "";
  const status = payment.status ? ` (${payment.status})` : "";

  return `${protocol}${amount ? ` ${amount}` : ""}${network}${status}`;
}

export function getPaymentTxHash(payment: unknown) {
  if (!payment || typeof payment !== "object" || Array.isArray(payment)) {
    return "";
  }

  const txHash = (payment as { tx_hash?: unknown }).tx_hash;
  return typeof txHash === "string" ? txHash : "";
}

export function formatTxHash(txHash: string) {
  return txHash.length > 18 ? `${txHash.slice(0, 10)}...${txHash.slice(-8)}` : txHash;
}
