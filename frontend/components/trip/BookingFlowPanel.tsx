import {
  formatPaymentLabel,
  formatSgdAmount,
  formatStayLabel,
  formatTxHash,
  getBookingFlowLabel,
  getPaymentTxHash,
  type BookingFlowState,
  type BookingFlowStatus,
} from "@/lib/trip/booking-flow";
import { buildPaymentExplorerLinks } from "@/lib/trip/payment-ui";

export function PlanApprovalCard({
  bookingState,
  onRequestBookingMandate,
  onConfirmHotelBooking,
}: {
  bookingState: BookingFlowState;
  onRequestBookingMandate?: () => void;
  onConfirmHotelBooking?: () => void;
}) {
  const preview = bookingState.mandateResponse?.preview ?? null;
  const receipt = bookingState.bookingResponse?.receipt ?? null;
  const payment = bookingState.bookingResponse?.payment ?? receipt?.payment ?? preview?.payment;
  const hotelName = receipt?.hotel?.name ?? preview?.hotel?.name ?? "Backend canonical demo hotel";
  const stayLabel = formatStayLabel(receipt?.stay ?? preview?.stay);
  const totalLabel = formatSgdAmount(
    receipt?.pricing?.estimated_total_sgd ?? preview?.pricing?.estimated_total_sgd,
  );
  const paymentLabel = formatPaymentLabel(payment);
  const txHash = getPaymentTxHash(payment);
  const confirmed = bookingState.status === "confirmed" && Boolean(receipt);
  const explorerLinks = buildPaymentExplorerLinks({
    confirmed,
    payment,
  });
  const errorMessage = bookingState.errorMessage;
  const isSigning = bookingState.status === "mandate_signing";
  const isSubmitting = bookingState.status === "booking_submitting";
  const canRequestMandate =
    Boolean(onRequestBookingMandate) && !isSigning && !isSubmitting;
  const canConfirmBooking =
    Boolean(onConfirmHotelBooking) && bookingState.status === "mandate_ready";

  return (
    <section
      data-testid="agentic-payment-card"
      className={[
        "mt-3 rounded-xl border p-3 shadow-xl shadow-black/20",
        confirmed
          ? "border-teal-100/50 bg-teal-300/14"
          : "border-amber-200/40 bg-amber-200/14",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[9px] font-black uppercase tracking-[0.18em] text-amber-100">
            Agentic booking payment
          </p>
          <h3 className="mt-1 text-base font-black leading-5 text-white">
            {confirmed ? "Hotel payment completed" : "Approve before the agent pays"}
          </h3>
          <p className="mt-1 text-xs font-semibold leading-5 text-slate-200">
            AP2 captures your approval, then the hotel agent runs the HashKey HSP + x402 payment loop.
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-white/10 bg-slate-950/45 px-2 py-1 text-[9px] font-black uppercase tracking-[0.08em] text-amber-100">
          {getBookingFlowLabel(bookingState.status)}
        </span>
      </div>

      <BookingFlowStepper status={bookingState.status} />

      {bookingState.status !== "idle" ? (
        <div className="mt-2 grid gap-2">
          <BookingDetailRow label="Hotel" value={hotelName} />
          <BookingDetailRow label="Stay" value={stayLabel} />
          <BookingDetailRow label="Estimate" value={totalLabel} />
          <BookingDetailRow label="x402" value={paymentLabel} />
          {receipt?.booking_id ? (
            <BookingDetailRow label="Receipt" value={receipt.booking_id} />
          ) : null}
          {txHash ? (
            <BookingDetailRow label="Tx hash" value={formatTxHash(txHash)} title={txHash} />
          ) : null}
        </div>
      ) : null}

      {confirmed ? (
        <div className="mt-2 rounded-lg border border-teal-100/35 bg-teal-300/12 px-3 py-2">
          <p className="text-xs font-black text-teal-50">
            Booking receipt issued. The payment rail is ready for explorer verification.
          </p>
          <PaymentExplorerButtons links={explorerLinks} />
        </div>
      ) : (
        <div className="mt-2 rounded-lg border border-white/10 bg-slate-950/45 px-3 py-2 text-[11px] font-semibold leading-4 text-slate-300">
          AP2 gates the hotel-booking action; HashKey HSP + x402 handles the payment step when testnet mode is enabled.
        </div>
      )}

      {errorMessage ? (
        <p className="mt-2 rounded-lg border border-red-300/30 bg-red-400/12 px-3 py-2 text-xs font-semibold leading-4 text-red-100">
          {errorMessage}
        </p>
      ) : null}

      {bookingState.status === "mandate_ready" ? (
        <button
          type="button"
          onClick={onConfirmHotelBooking}
          disabled={!canConfirmBooking}
          className="mt-2 h-8 w-full rounded-lg border border-teal-100/35 bg-teal-200 px-3 text-[11px] font-black uppercase tracking-[0.14em] text-slate-950 transition hover:bg-teal-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Run x402 hotel payment
        </button>
      ) : bookingState.status === "confirmed" ? (
        <button
          type="button"
          disabled
          className="mt-2 h-8 w-full rounded-lg border border-teal-100/35 bg-teal-200 px-3 text-[11px] font-black uppercase tracking-[0.14em] text-slate-950 opacity-70"
        >
          Payment complete
        </button>
      ) : (
        <button
          type="button"
          onClick={onRequestBookingMandate}
          disabled={!canRequestMandate}
          className="mt-2 h-8 w-full rounded-lg border border-amber-100/35 bg-amber-200 px-3 text-[11px] font-black uppercase tracking-[0.14em] text-slate-950 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSigning
            ? "Signing AP2 mandate"
            : isSubmitting
              ? "Agent paying with x402"
              : "Approve AP2 mandate"}
        </button>
      )}
    </section>
  );
}

function BookingFlowStepper({ status }: { status: BookingFlowStatus }) {
  const steps = [
    {
      key: "approve",
      label: "Approve",
      done: !["idle", "mandate_signing", "failed", "rejected"].includes(status),
      active: status === "idle" || status === "mandate_signing",
    },
    {
      key: "pay",
      label: "x402 Pay",
      done: status === "confirmed",
      active: status === "mandate_ready" || status === "booking_submitting",
    },
    {
      key: "receipt",
      label: "Receipt",
      done: status === "confirmed",
      active: status === "confirmed",
    },
  ];

  return (
    <ol className="mt-3 grid grid-cols-3 gap-1.5">
      {steps.map((step) => (
        <li
          key={step.key}
          className={[
            "rounded-lg border px-2 py-1.5 text-center",
            step.done
              ? "border-teal-100/35 bg-teal-300/14 text-teal-50"
              : step.active
                ? "border-amber-100/40 bg-amber-200/16 text-amber-50"
                : "border-white/10 bg-white/6 text-slate-400",
          ].join(" ")}
        >
          <span className="text-[9px] font-black uppercase tracking-[0.08em]">
            {step.label}
          </span>
        </li>
      ))}
    </ol>
  );
}

function PaymentExplorerButtons({ links }: { links: ReturnType<typeof buildPaymentExplorerLinks> }) {
  if (links.length === 0) {
    return null;
  }

  return (
    <div className="mt-2 grid gap-1.5">
      {links.map((link) => (
        <a
          key={`${link.kind}-${link.url}`}
          href={link.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-8 items-center justify-center rounded-lg border border-teal-100/35 bg-teal-200 px-3 text-center text-[11px] font-black uppercase tracking-[0.1em] text-slate-950 transition hover:bg-teal-100"
        >
          {link.label}
        </a>
      ))}
    </div>
  );
}

function BookingDetailRow({
  label,
  value,
  title,
}: {
  label: string;
  value: string;
  title?: string;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/8 px-3 py-2" title={title}>
      <p className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 truncate text-xs font-black text-slate-100">{value}</p>
    </div>
  );
}
