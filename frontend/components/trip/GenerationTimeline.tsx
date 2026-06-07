import { getStageSteps } from "@/lib/trip/agent-copy";
import type { GenerationStatus } from "@/lib/trip/generation-state";

export function GenerationTimeline({
  status,
  hasPlaces,
}: {
  status: GenerationStatus;
  hasPlaces: boolean;
}) {
  const steps = getStageSteps(status, hasPlaces);

  return (
    <div className="mt-3 rounded-xl border border-white/10 bg-slate-950/72 p-2.5 shadow-2xl shadow-black/30 backdrop-blur-xl">
      <div className="grid min-w-0 grid-cols-5 gap-1">
        {steps.map((step) => (
          <div
            key={step.key}
            className={[
              "min-w-0 overflow-hidden rounded-lg border px-1.5 py-2",
              step.done
                ? "border-teal-200/30 bg-teal-300/12 text-teal-100"
                : step.active
                  ? "border-amber-200/40 bg-amber-200/14 text-amber-100"
                  : "border-white/10 bg-white/6 text-slate-400",
            ].join(" ")}
          >
            <div className="flex min-w-0 items-center justify-center gap-1">
              <span
                className={[
                  "h-2 w-2 shrink-0 rounded-full",
                  step.done
                    ? "bg-teal-200"
                    : step.active
                      ? "animate-pulse bg-amber-200"
                      : "bg-slate-600",
                ].join(" ")}
              />
              <p className="min-w-0 truncate text-[8px] font-black uppercase tracking-[0] lg:text-[9px]">
                {getCompactStageLabel(step.key)}
              </p>
            </div>
            <p className="mt-1 hidden text-center text-[10px] font-semibold leading-3 text-current/75 xl:block">
              {step.detail}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function getCompactStageLabel(key: ReturnType<typeof getStageSteps>[number]["key"]) {
  const labels: Record<ReturnType<typeof getStageSteps>[number]["key"], string> = {
    extract: "Read",
    ground: "Map",
    base: "Base",
    plan: "Plan",
    approve: "Book",
  };

  return labels[key];
}
