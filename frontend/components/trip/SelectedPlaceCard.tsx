import type { TripDay, TripPlace } from "@/lib/trip/types";

type SelectedPlaceCardProps = {
  place: TripPlace | null;
  days?: TripDay[];
  locked?: boolean;
  onToggleLock?: (placeId: string) => void;
  onViewIntel?: () => void;
};

export function SelectedPlaceCard({
  place,
  days = [],
  locked = false,
  onToggleLock,
  onViewIntel,
}: SelectedPlaceCardProps) {
  if (!place) {
    return null;
  }

  const day = days.find((candidate) => candidate.day === place.day) ?? null;
  const fit = buildFitText(place, day);
  const evidence = buildEvidenceText(place);
  const tradeoff = buildTradeoffText(place, day);

  return (
    <section className="absolute bottom-[188px] left-1/2 z-10 w-[min(590px,calc(100vw-2rem))] -translate-x-1/2 rounded-2xl border border-white/10 bg-slate-950/84 p-5 shadow-2xl shadow-black/40 backdrop-blur-xl md:bottom-[190px]">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-black uppercase tracking-[0.34em] text-amber-200">
            Selected place
          </p>
          <h2 className="mt-2 truncate text-2xl font-black tracking-tight text-white">
            {place.name}
          </h2>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <Pill>Day {place.day}</Pill>
          <Pill>{place.category}</Pill>
          {locked ? <Pill>Locked</Pill> : null}
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <DecisionSnippet label="Fit" value={fit} />
        <DecisionSnippet label="Evidence" value={evidence} />
        <DecisionSnippet label="Tradeoff" value={tradeoff} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {onViewIntel ? (
          <button
            type="button"
            onClick={onViewIntel}
            className="h-10 rounded-xl border border-amber-200/35 bg-amber-200/14 px-4 text-xs font-black uppercase tracking-[0.18em] text-amber-100 transition hover:bg-amber-200/22"
          >
            View place intel
          </button>
        ) : null}
        {onToggleLock ? (
          <button
            type="button"
            onClick={() => onToggleLock(place.id)}
            className={[
              "h-10 rounded-xl border px-4 text-xs font-black uppercase tracking-[0.18em] transition",
              locked
                ? "border-teal-200/45 bg-teal-300/14 text-teal-100"
                : "border-white/10 bg-white/8 text-slate-200 hover:bg-white/12",
            ].join(" ")}
          >
            {locked ? "Stop locked" : "Lock stop"}
          </button>
        ) : null}
      </div>
    </section>
  );
}

function DecisionSnippet({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-white/8 bg-white/6 px-3 py-2">
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 line-clamp-2 text-xs font-semibold leading-5 text-slate-300">
        {value}
      </p>
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-white/10 bg-white/12 px-4 py-3 text-sm font-bold capitalize text-slate-100">
      {children}
    </span>
  );
}

function buildFitText(place: TripPlace, day: TripDay | null) {
  return truncateText(place.plannerSummary || place.summary || day?.summary || "Mapped stop.", 92);
}

function buildEvidenceText(place: TripPlace) {
  if (place.evidenceQuote) {
    return truncateText(place.evidenceQuote, 92);
  }

  if (typeof place.confidence === "number") {
    return `${Math.round(place.confidence * 100)}% extraction confidence.`;
  }

  return "No direct Reel quote returned.";
}

function buildTradeoffText(place: TripPlace, day: TripDay | null) {
  const text = [place.dayPlanText, place.plannerSummary, day?.summary, day?.weatherStrategy]
    .filter(Boolean)
    .join(" ");
  const tradeoff = splitSentences(text).find((sentence) => {
    const lower = sentence.toLowerCase();
    return ["long", "walk", "transit", "station", "weather", "rain", "route", "far"].some(
      (keyword) => lower.includes(keyword),
    );
  });

  return truncateText(tradeoff || place.address || "No explicit tradeoff returned.", 92);
}

function splitSentences(text: string) {
  return text
    .split(/(?<=[.!?])\s+|;\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1).trimEnd()}...`;
}
