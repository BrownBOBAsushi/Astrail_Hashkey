import { PlanApprovalCard } from "@/components/trip/PlanApprovalCard";
import {
  buildDecisionSummary,
  buildEvidenceSummary,
  buildNextActionSummary,
  buildTradeoffSummary,
  getAgentPanelTitle,
} from "@/lib/trip/agent-copy";
import {
  INITIAL_BOOKING_FLOW_STATE,
  type BookingFlowState,
} from "@/lib/trip/booking-flow";
import type { ExtractResponse, UserPreferencesPayload } from "@/lib/trip/backend-types";
import type {
  GenerationLog,
  GenerationStatus,
  SteeringState,
} from "@/lib/trip/generation-state";
import type { TripDay, TripHotelBase, TripPlace } from "@/lib/trip/types";

type AgentDecisionRailProps = {
  status: GenerationStatus;
  logs: GenerationLog[];
  elapsedSeconds: number | null;
  extractResponse: ExtractResponse | null;
  preferences: UserPreferencesPayload | null;
  selectedPlace: TripPlace | null;
  days: TripDay[];
  hotelBase?: TripHotelBase;
  steering: SteeringState;
  bookingState?: BookingFlowState;
  onToggleHotelBaseLock: () => void;
  onTogglePlaceLock: (placeId: string) => void;
  onTogglePriorityTheme: (theme: string) => void;
  onRequestRegenerateDay: (day: number) => void;
  onAddSteeringNote: (note: string) => void;
  onRequestBookingMandate?: () => void;
  onConfirmHotelBooking?: () => void;
};

export function AgentDecisionRail({
  status,
  logs,
  elapsedSeconds,
  extractResponse,
  preferences,
  selectedPlace,
  days,
  hotelBase,
  steering,
  bookingState,
  onRequestBookingMandate,
  onConfirmHotelBooking,
}: AgentDecisionRailProps) {
  if (status === "idle_globe") {
    return null;
  }

  const selectedDay = selectedPlace
    ? days.find((day) => day.day === selectedPlace.day) ?? null
    : null;

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-teal-200">
            Agent decision
          </p>
          <h2 className="mt-1 text-xl font-black leading-6 tracking-tight text-white">
            {getAgentPanelTitle(status)}
          </h2>
        </div>
        {elapsedSeconds !== null ? (
          <span className="rounded-full border border-white/10 bg-white/10 px-2.5 py-1 text-[11px] font-bold text-slate-200">
            {elapsedSeconds.toFixed(1)}s
          </span>
        ) : null}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Metric label="Places" value={String(extractResponse?.count ?? "-")} />
        <Metric label="Source" value={extractResponse?.source ?? "-"} />
        <Metric label="Dates" value={preferences ? `${preferences.start_date.slice(5)}-${preferences.end_date.slice(5)}` : "-"} />
        <Metric label="Budget" value={preferences?.budget_level.replace("_", " ") ?? "-"} />
      </div>

      <div className="mt-3 space-y-2">
        <DecisionRow
          label="Decision"
          value={buildDecisionSummary(status, selectedPlace, hotelBase, logs)}
          tone="decision"
        />
        <DecisionRow
          label="Evidence"
          value={buildEvidenceSummary(selectedPlace, extractResponse)}
          tone="evidence"
        />
        <DecisionRow
          label="Tradeoff"
          value={buildTradeoffSummary(selectedPlace, selectedDay, hotelBase)}
          tone="tradeoff"
        />
        <DecisionRow
          label="Next action"
          value={buildNextActionSummary(status, selectedPlace, steering)}
          tone="next"
        />
      </div>

      {status === "trip_ready" ? (
        <PlanApprovalCard
          bookingState={bookingState ?? INITIAL_BOOKING_FLOW_STATE}
          onRequestBookingMandate={onRequestBookingMandate}
          onConfirmHotelBooking={onConfirmHotelBooking}
        />
      ) : null}

      <div className="mt-3 space-y-2">
        <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-500">
          Recent events
        </p>
        {logs.length === 0 ? (
          <p className="rounded-lg border border-white/10 bg-white/8 px-3 py-2 text-xs font-semibold leading-5 text-slate-300">
            Waiting for the first backend event.
          </p>
        ) : (
          logs.slice(-3).map((log) => (
            <div
              key={log.id}
              className={[
                "rounded-lg border px-3 py-2",
                log.tone === "success"
                  ? "border-teal-200/25 bg-teal-300/10"
                  : log.tone === "warning"
                    ? "border-amber-200/30 bg-amber-200/12"
                    : log.tone === "error"
                      ? "border-red-300/30 bg-red-400/12"
                      : "border-white/10 bg-white/8",
              ].join(" ")}
            >
              <p className="text-xs font-black text-white">{log.title}</p>
              <p className="mt-1 line-clamp-2 text-xs font-semibold leading-4 text-slate-300">
                {log.detail}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function DecisionRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "decision" | "evidence" | "tradeoff" | "next";
}) {
  const toneClass =
    tone === "decision"
      ? "border-amber-200/30 bg-amber-200/12"
      : tone === "evidence"
        ? "border-teal-200/25 bg-teal-300/10"
        : tone === "tradeoff"
          ? "border-sky-200/20 bg-sky-300/8"
          : "border-white/10 bg-white/8";

  return (
    <section className={`rounded-lg border px-3 py-2 ${toneClass}`}>
      <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 line-clamp-2 text-xs font-semibold leading-5 text-slate-200">{value}</p>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/8 px-2.5 py-2">
      <p className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 truncate text-xs font-black capitalize text-slate-100">{value}</p>
    </div>
  );
}
