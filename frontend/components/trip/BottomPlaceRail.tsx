import {
  buildItineraryTimeline,
  getCategoryGlyph,
  type ItineraryTimelineDay,
} from "@/lib/trip/itinerary-ui";
import type { DayFilter, TripDay, TripPlace } from "@/lib/trip/types";

type BottomPlaceRailProps = {
  days: TripDay[];
  places: TripPlace[];
  selectedPlaceId: string | null;
  lockedPlaceIds?: Set<string>;
  onSelectPlace: (placeId: string) => void;
  onSelectDay?: (day: DayFilter) => void;
};

export function BottomPlaceRail({
  days,
  places,
  selectedPlaceId,
  lockedPlaceIds,
  onSelectPlace,
  onSelectDay,
}: BottomPlaceRailProps) {
  if (places.length === 0) {
    return null;
  }

  const timeline = buildItineraryTimeline(days, places, selectedPlaceId).filter(
    (day) => day.stopCount > 0,
  );

  return (
    <nav
      aria-label="Trip itinerary timeline"
      className="absolute bottom-3 left-3 right-3 z-10 flex gap-2 overflow-x-auto overflow-y-hidden pb-1 md:left-4 md:right-4 lg:left-[360px] lg:right-[370px] xl:left-[382px] xl:right-[398px]"
    >
      {timeline.map((day) => (
        <DayTimelineCard
          key={day.day}
          day={day}
          lockedPlaceIds={lockedPlaceIds}
          onSelectDay={onSelectDay}
          onSelectPlace={onSelectPlace}
        />
      ))}
    </nav>
  );
}

function DayTimelineCard({
  day,
  lockedPlaceIds,
  onSelectDay,
  onSelectPlace,
}: {
  day: ItineraryTimelineDay;
  lockedPlaceIds?: Set<string>;
  onSelectDay?: (day: DayFilter) => void;
  onSelectPlace: (placeId: string) => void;
}) {
  return (
    <article
      className={[
        "min-w-[276px] max-w-[276px] rounded-xl border p-2.5 text-left shadow-2xl shadow-black/25 backdrop-blur-xl transition md:min-w-[304px] md:max-w-[304px]",
        day.selected
          ? "border-amber-200 bg-[#182432]/92"
          : "border-white/10 bg-[#101821]/78",
      ].join(" ")}
    >
      <button
        type="button"
        onClick={() => onSelectDay?.(day.day)}
        className="flex w-full items-start justify-between gap-3 text-left"
      >
        <span className="min-w-0">
          <span className="block text-[10px] font-black uppercase tracking-[0.16em] text-amber-200">
            Route sequence / Day {day.day}
          </span>
          <span className="mt-0.5 block truncate text-sm font-black leading-5 text-white">
            {day.title}
          </span>
        </span>
        <span className="shrink-0 rounded-full border border-cyan-100/25 bg-cyan-300/10 px-2 py-0.5 text-[10px] font-black text-cyan-100">
          {day.routeLabel}
        </span>
      </button>

      {day.summary ? (
        <p className="mt-1.5 line-clamp-1 text-[11px] font-semibold leading-4 text-slate-300">
          {day.summary}
        </p>
      ) : null}

      <ol className="mt-2 space-y-1">
        {day.stops.map((stop, index) => (
          <li key={stop.id}>
            <button
              type="button"
              disabled={!stop.selectable || !stop.placeId}
              onClick={() => {
                if (stop.placeId) {
                  onSelectPlace(stop.placeId);
                }
              }}
              className={[
                "grid min-h-9 w-full grid-cols-[22px_3.8rem_1fr_auto] items-center gap-2 rounded-lg border px-2 py-1 text-left transition disabled:cursor-default",
                stop.selected
                  ? "border-amber-200/55 bg-amber-200/14"
                  : stop.selectable
                    ? "border-white/8 bg-white/6 hover:bg-white/10"
                    : "border-cyan-100/12 bg-cyan-300/8",
              ].join(" ")}
            >
              <span
                className={[
                  "flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-black",
                  stop.selected
                    ? "bg-amber-200 text-slate-950"
                    : "bg-white/10 text-slate-200",
                ].join(" ")}
              >
                {index + 1}
              </span>
              <span className="text-[9px] font-black uppercase tracking-[0.08em] text-teal-100/80">
                {stop.timeOfDay ?? "stop"}
              </span>
              <span className="min-w-0 truncate text-xs font-black text-white">
                {stop.name}
              </span>
              <span className="flex shrink-0 items-center gap-1">
                {stop.placeId && lockedPlaceIds?.has(stop.placeId) ? (
                  <StatusDot title="Locked" />
                ) : null}
                <span className="rounded-full border border-white/10 bg-white/10 px-1.5 py-0.5 text-[10px] font-black uppercase text-slate-200">
                  {getCategoryGlyph(stop.category)}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ol>
    </article>
  );
}

function StatusDot({ title }: { title: string }) {
  return (
    <span
      title={title}
      className="h-2 w-2 rounded-full bg-teal-200 shadow-[0_0_12px_rgba(94,234,212,0.75)]"
    />
  );
}
