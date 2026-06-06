import type { TripDay } from "@/lib/trip/types";

type WeatherStrategyStripProps = {
  days: TripDay[];
};

export function WeatherStrategyStrip({ days }: WeatherStrategyStripProps) {
  const weatherDays = days.filter((day) => day.weatherStrategy);

  if (weatherDays.length === 0) {
    return null;
  }

  return (
    <div className="absolute left-[552px] right-[424px] top-6 z-20 hidden gap-3 overflow-x-auto pb-1 xl:flex">
      {weatherDays.map((day) => (
        <div
          key={day.day}
          className="min-w-[210px] max-w-[280px] rounded-xl border border-sky-200/20 bg-slate-950/82 px-4 py-3 shadow-2xl shadow-black/25 backdrop-blur-xl md:min-w-[240px]"
        >
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-sky-200">
            Day {day.day} weather
          </p>
          <p className="mt-2 line-clamp-2 text-sm font-semibold leading-5 text-slate-200">
            {day.weatherStrategy}
          </p>
        </div>
      ))}
    </div>
  );
}
