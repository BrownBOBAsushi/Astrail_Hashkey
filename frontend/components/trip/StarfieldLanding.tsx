"use client";

type StarfieldLandingProps = {
  onReveal: () => void;
};

export function StarfieldLanding({ onReveal }: StarfieldLandingProps) {
  return (
    <button
      type="button"
      onClick={onReveal}
      className="tc-globe-landing absolute inset-0 z-30 min-h-screen w-full overflow-hidden px-5 text-center text-white"
      aria-label="Enter TripCanvas"
    >
      <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_44%,rgba(2,6,23,0),rgba(2,6,23,0.16)_44%,rgba(2,6,23,0.72)_100%)]" />
      <span className="absolute left-1/2 top-1/2 z-10 block w-[min(86vw,960px)] -translate-x-1/2 -translate-y-1/2">
        <span className="tc-star-wars-wordmark block" aria-hidden="true">
          TripCanvas
        </span>
        <span className="sr-only">TripCanvas</span>
      </span>
      <span className="absolute left-1/2 top-[calc(50%+4.8rem)] z-10 block w-[min(86vw,720px)] -translate-x-1/2 sm:top-[calc(50%+6.25rem)] lg:top-[calc(50%+7.25rem)]">
        <span className="mt-4 block text-3xl font-black text-white sm:text-4xl">
          Reels to routes.
        </span>
        <span className="mt-4 block text-sm font-semibold leading-6 text-slate-300 sm:text-base">
          Extract places, choose a hotel base, and map the trip.
        </span>
      </span>
    </button>
  );
}
