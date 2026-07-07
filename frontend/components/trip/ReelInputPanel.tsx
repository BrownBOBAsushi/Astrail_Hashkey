import type { FormEvent, ReactNode } from "react";
import type { BudgetLevel } from "@/lib/trip/backend-types";

type ReelInputPanelProps = {
  reelInput: string;
  startDate: string;
  endDate: string;
  budgetLevel: BudgetLevel;
  originCity: string;
  preferences: string;
  isBusy: boolean;
  errorMessage: string | null;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onReelInputChange: (value: string) => void;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  onBudgetLevelChange: (value: BudgetLevel) => void;
  onOriginCityChange: (value: string) => void;
  onPreferencesChange: (value: string) => void;
  onUseDemoReels: () => void;
  onLoadBackendCache: () => void;
};

export function ReelInputPanel({
  reelInput,
  startDate,
  endDate,
  budgetLevel,
  originCity,
  preferences,
  isBusy,
  errorMessage,
  onSubmit,
  onReelInputChange,
  onStartDateChange,
  onEndDateChange,
  onBudgetLevelChange,
  onOriginCityChange,
  onPreferencesChange,
  onUseDemoReels,
  onLoadBackendCache,
}: ReelInputPanelProps) {
  return (
    <form
      onSubmit={onSubmit}
      className="rounded-xl border border-white/12 bg-slate-950/76 p-3 shadow-2xl shadow-black/35 backdrop-blur-xl lg:p-4"
    >
      <p className="text-[10px] font-black uppercase tracking-[0.28em] text-amber-200">
        Astrail
      </p>
      <h1 className="mt-1 text-xl font-black leading-6 tracking-tight text-white">
        Turn saved Reels into a live trip map
      </h1>
      <p className="mt-1 line-clamp-2 text-[11px] font-semibold leading-4 text-slate-300">
        Paste travel Reels and let the agent extract real places, zoom the globe, and build the itinerary.
      </p>

      <label className="mt-3 block">
        <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
          Instagram Reel URLs
        </span>
        <textarea
          value={reelInput}
          onChange={(event) => onReelInputChange(event.target.value)}
          disabled={isBusy}
          rows={2}
          placeholder="https://www.instagram.com/reel/..."
          className="mt-1.5 min-h-[58px] w-full resize-none overflow-x-hidden rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-xs font-semibold leading-5 text-white outline-none transition [overflow-wrap:anywhere] placeholder:text-slate-500 focus:border-amber-200/60 disabled:cursor-not-allowed disabled:opacity-60"
        />
      </label>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={onUseDemoReels}
          disabled={isBusy}
          className="min-h-9 rounded-lg border border-white/10 bg-white/8 px-2 text-[10px] font-black uppercase leading-none tracking-[0.07em] text-slate-100 transition hover:bg-white/12 disabled:cursor-not-allowed disabled:opacity-60 sm:px-3"
        >
          Demo Reels
        </button>
        <button
          type="button"
          onClick={onLoadBackendCache}
          disabled={isBusy}
          className="min-h-9 rounded-lg border border-teal-200/30 bg-teal-300/14 px-2 text-[10px] font-black uppercase leading-none tracking-[0.07em] text-teal-100 transition hover:bg-teal-300/20 disabled:cursor-not-allowed disabled:opacity-60 sm:px-3"
        >
          Backend Cache
        </button>
      </div>

      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <Field label="Start date">
          <input
            type="date"
            value={startDate}
            onChange={(event) => onStartDateChange(event.target.value)}
            disabled={isBusy}
            className="field-input"
          />
        </Field>
        <Field label="End date">
          <input
            type="date"
            value={endDate}
            onChange={(event) => onEndDateChange(event.target.value)}
            disabled={isBusy}
            className="field-input"
          />
        </Field>
      </div>

      <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_1.1fr]">
        <Field label="Budget">
          <select
            value={budgetLevel}
            onChange={(event) => onBudgetLevelChange(event.target.value as BudgetLevel)}
            disabled={isBusy}
            className="field-input"
          >
            <option value="budget">Budget</option>
            <option value="mid_range">Mid range</option>
            <option value="luxury">Luxury</option>
          </select>
        </Field>
        <Field label="Origin city">
          <input
            type="text"
            value={originCity}
            onChange={(event) => onOriginCityChange(event.target.value)}
            disabled={isBusy}
            placeholder="Singapore"
            className="field-input"
          />
        </Field>
      </div>

      <label className="mt-2 block">
        <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
          Preferences
        </span>
        <textarea
          value={preferences}
          onChange={(event) => onPreferencesChange(event.target.value)}
          disabled={isBusy}
          rows={2}
          className="mt-1.5 min-h-[48px] w-full resize-none overflow-x-hidden rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-xs font-semibold leading-5 text-white outline-none transition [overflow-wrap:anywhere] placeholder:text-slate-500 focus:border-amber-200/60 disabled:cursor-not-allowed disabled:opacity-60"
        />
      </label>

      {errorMessage ? (
        <p className="mt-2 rounded-lg border border-red-300/30 bg-red-400/12 px-3 py-2 text-xs font-semibold leading-5 text-red-100">
          {errorMessage}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isBusy}
        className="mt-2.5 h-9 w-full rounded-lg border border-amber-100/30 bg-amber-200 px-4 text-[11px] font-black uppercase tracking-[0.12em] text-slate-950 shadow-xl shadow-amber-950/25 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isBusy ? "Generating trip map" : "Generate trip map"}
      </button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
        {label}
      </span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}
