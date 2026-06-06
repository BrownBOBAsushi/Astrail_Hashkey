"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { TripMap, type TripMapMode } from "@/components/map/TripMap";
import { BottomPlaceRail } from "@/components/trip/BottomPlaceRail";
import {
  buildHotelPreferencePayload,
  HotelBasePanel,
  HOTEL_BASE_CHIPS,
  type HotelBaseProgressItem,
} from "@/components/trip/HotelBasePanel";
import { RightTripPanel, type RightPanelTab } from "@/components/trip/RightTripPanel";
import { SelectedPlaceCard } from "@/components/trip/SelectedPlaceCard";
import { StarfieldLanding } from "@/components/trip/StarfieldLanding";
import { TripCanvasShell } from "@/components/trip/TripCanvasShell";
import type {
  BudgetLevel,
  BackendExtractedPlace,
  ExtractResponse,
  HotelBaseResult,
  HotelBaseStreamEvent,
  HotelPreferencePayload,
  ItineraryStreamEvent,
  UserPreferencesPayload,
} from "@/lib/trip/backend-types";
import {
  buildFinalTrip,
  buildPreferencesPayload,
  buildProvisionalTrip,
  extractReelPlaces,
  streamHotelBase,
  streamItinerary,
} from "@/lib/trip/generate-trip";
import type { TripDay, TripExperience, TripHotelBase, TripPlace } from "@/lib/trip/types";

type GenerationStatus =
  | "idle_globe"
  | "extracting_places"
  | "zooming_to_destination"
  | "choosing_hotel_base"
  | "optimizing_hotel_base"
  | "planning_itinerary"
  | "trip_ready"
  | "error";

type GenerationLog = {
  id: string;
  title: string;
  detail: string;
  tone: "info" | "success" | "warning" | "error";
};

type SteeringState = {
  lockedHotelBase: boolean;
  lockedPlaceIds: Set<string>;
  priorityThemes: string[];
  regenerateDay: number | null;
  steeringNotes: string[];
};

const PRIORITY_THEMES = [
  { id: "food", label: "Food" },
  { id: "transit", label: "Transit" },
  { id: "value", label: "Value" },
  { id: "weather", label: "Weather" },
] as const;

const EMPTY_GLOBE_TRIP: TripExperience = {
  id: "empty-globe",
  title: "TripCanvas",
  datesLabel: "Trip dates",
  destination: {
    city: "Earth",
    country: "",
    center: [103.8198, 1.3521],
    zoom: 1.35,
  },
  days: [],
  places: [],
};

const DEFAULT_REEL_INPUT = "";
const DEFAULT_START_DATE = "2026-06-10";
const DEFAULT_END_DATE = "2026-06-13";
const DEFAULT_BUDGET: BudgetLevel = "mid_range";
const DEFAULT_ORIGIN_CITY = "Singapore";
const DEFAULT_PREFERENCES = "Love ramen, onsen, walkable neighborhoods, and good hotel value.";

export function TripGenerationShell() {
  const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const abortControllerRef = useRef<AbortController | null>(null);
  const focusResolverRef = useRef<(() => void) | null>(null);
  const runIdRef = useRef(0);
  const [status, setStatus] = useState<GenerationStatus>("idle_globe");
  const [reelInput, setReelInput] = useState(DEFAULT_REEL_INPUT);
  const [landingRevealed, setLandingRevealed] = useState(false);
  const [startDate, setStartDate] = useState(DEFAULT_START_DATE);
  const [endDate, setEndDate] = useState(DEFAULT_END_DATE);
  const [budgetLevel, setBudgetLevel] = useState<BudgetLevel>(DEFAULT_BUDGET);
  const [originCity, setOriginCity] = useState(DEFAULT_ORIGIN_CITY);
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);
  const [extractResponse, setExtractResponse] = useState<ExtractResponse | null>(null);
  const [preferencesPayload, setPreferencesPayload] = useState<UserPreferencesPayload | null>(null);
  const [hotelPreferenceChips, setHotelPreferenceChips] = useState<string[]>(["optimize_for_me"]);
  const [hotelPreferenceNotes, setHotelPreferenceNotes] = useState("");
  const [hotelBaseProgressItems, setHotelBaseProgressItems] = useState<HotelBaseProgressItem[]>([]);
  const [provisionalTrip, setProvisionalTrip] = useState<TripExperience | null>(null);
  const [finalTrip, setFinalTrip] = useState<TripExperience | null>(null);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [rightPanelTab, setRightPanelTab] = useState<RightPanelTab>("agent-run");
  const [logs, setLogs] = useState<GenerationLog[]>([]);
  const [streamElapsedSeconds, setStreamElapsedSeconds] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lockedHotelBase, setLockedHotelBase] = useState(false);
  const [lockedPlaceIds, setLockedPlaceIds] = useState<Set<string>>(() => new Set());
  const [priorityThemes, setPriorityThemes] = useState<string[]>([]);
  const [regenerateDay, setRegenerateDay] = useState<number | null>(null);
  const [steeringNotes, setSteeringNotes] = useState<string[]>([]);

  const activeTrip = provisionalTrip ?? EMPTY_GLOBE_TRIP;
  const selectedPlace = useMemo(
    () => activeTrip.places.find((place) => place.id === selectedPlaceId) ?? null,
    [activeTrip.places, selectedPlaceId],
  );
  const mapCenter = useMemo(
    () => ({
      lng: activeTrip.destination.center[0],
      lat: activeTrip.destination.center[1],
    }),
    [activeTrip.destination.center],
  );
  const mapMode = getMapMode(status, provisionalTrip);
  const isBusy =
    status === "extracting_places" ||
    status === "zooming_to_destination" ||
    status === "choosing_hotel_base" ||
    status === "optimizing_hotel_base" ||
    status === "planning_itinerary";
  const cacheNotice = extractResponse?.source === "cache" ? "Cache fallback" : undefined;

  const pushLog = useCallback((title: string, detail: string, tone: GenerationLog["tone"]) => {
    setLogs((current) => [
      ...current,
      {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        title,
        detail,
        tone,
      },
    ]);
  }, []);

  const pushHotelBaseProgress = useCallback(
    (title: string, detail: string, tone: HotelBaseProgressItem["tone"] = "info") => {
      setHotelBaseProgressItems((current) => [
        ...current,
        {
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          title,
          detail,
          tone,
        },
      ]);
    },
    [],
  );

  const waitForRegionFocus = useCallback(() => {
    return new Promise<void>((resolve) => {
      const timeoutId = window.setTimeout(() => {
        focusResolverRef.current = null;
        resolve();
      }, 2600);

      focusResolverRef.current = () => {
        window.clearTimeout(timeoutId);
        focusResolverRef.current = null;
        resolve();
      };
    });
  }, []);

  const handleRegionFocusComplete = useCallback(() => {
    focusResolverRef.current?.();
  }, []);

  const handleStreamEvent = useCallback(
    (event: ItineraryStreamEvent) => {
      if (event.type === "start") {
        pushLog(
          "Planning started",
          `Using ${event.n_places_used ?? "selected"} of ${event.n_places_in ?? "the"} extracted places for ${event.destination ?? "the destination"}.`,
          "info",
        );
        return;
      }

      if (event.type === "heartbeat") {
        setStreamElapsedSeconds(typeof event.elapsed_s === "number" ? event.elapsed_s : null);
        return;
      }

      if (event.type === "result") {
        pushLog("Itinerary ready", "The planner returned the final day-by-day trip.", "success");
        return;
      }
    },
    [pushLog],
  );

  const handleHotelBaseStreamEvent = useCallback(
    (event: HotelBaseStreamEvent) => {
      if (event.type === "start") {
        const detail = `Scoring base areas for ${event.destination ?? "the mapped destination"}.`;
        pushLog(
          "Hotel-base search started",
          detail,
          "info",
        );
        pushHotelBaseProgress("Search started", detail);
        return;
      }

      if (event.type === "heartbeat") {
        setStreamElapsedSeconds(readStreamEventNumber(event.elapsed_s));
        return;
      }

      if (event.type === "stage") {
        const detail =
          readStreamEventString(event.msg) ||
          readStreamEventString(event.stage) ||
          "Researching base options.";
        pushLog(
          "Hotel-base research",
          detail,
          "info",
        );
        pushHotelBaseProgress("Research", detail);
        return;
      }

      if (event.type === "base_candidate") {
        const candidate = readStreamEventRecord(event.candidate);
        const name = readStreamEventString(candidate?.name) || "Base area";
        const score = readStreamEventNumber(candidate?.score);
        pushLog(
          "Base candidate",
          score === null ? name : `${name} scored ${score.toFixed(1)}.`,
          "info",
        );
        pushHotelBaseProgress(
          "Base candidate",
          score === null ? name : `${name} scored ${score.toFixed(1)}.`,
        );
        return;
      }

      if (event.type === "hotel_candidate") {
        const candidate = readStreamEventRecord(event.candidate);
        const detail = readStreamEventString(candidate?.name) || "Hotel option";
        pushLog("Hotel candidate", detail, "info");
        pushHotelBaseProgress("Hotel candidate", detail);
        return;
      }

      if (event.type === "result") {
        setStreamElapsedSeconds(typeof event.elapsed_s === "number" ? event.elapsed_s : null);
        pushLog("Hotel base ready", "The optimizer selected a base for route planning.", "success");
        pushHotelBaseProgress(
          "Hotel base ready",
          "The optimizer selected a base for route planning.",
          "success",
        );
      }
    },
    [pushHotelBaseProgress, pushLog],
  );

  const handleSelectPlace = useCallback((placeId: string) => {
    setSelectedPlaceId(placeId);
    setRightPanelTab("place-intel");
  }, []);

  const handleViewIntel = useCallback(() => {
    setRightPanelTab("place-intel");
  }, []);

  const handleToggleSelectedPlaceLock = useCallback((placeId: string) => {
    setLockedPlaceIds((current) => {
      const next = new Set(current);
      if (next.has(placeId)) {
        next.delete(placeId);
      } else {
        next.add(placeId);
      }

      return next;
    });
  }, []);

  const handleToggleHotelBaseLock = useCallback(() => {
    setLockedHotelBase((current) => !current);
  }, []);

  const handleTogglePriorityTheme = useCallback((theme: string) => {
    setPriorityThemes((current) =>
      current.includes(theme) ? current.filter((item) => item !== theme) : [...current, theme],
    );
  }, []);

  const handleRequestRegenerateDay = useCallback((day: number) => {
    setRegenerateDay((current) => (current === day ? null : day));
  }, []);

  const handleAddSteeringNote = useCallback((note: string) => {
    const trimmed = note.trim();
    if (!trimmed) {
      return;
    }

    setSteeringNotes((current) => [...current, trimmed].slice(-5));
  }, []);

  const handleToggleHotelPreferenceChip = useCallback((chip: string) => {
    setHotelPreferenceChips((current) => {
      if (chip === "optimize_for_me") {
        return current.includes("optimize_for_me") ? ["optimize_for_me"] : ["optimize_for_me"];
      }

      const specificChips = current.filter((item) => item !== "optimize_for_me");
      const nextSpecificChips = specificChips.includes(chip)
        ? specificChips.filter((item) => item !== chip)
        : [...specificChips, chip];

      return nextSpecificChips.length === 0 ? ["optimize_for_me"] : nextSpecificChips;
    });
  }, []);

  const handlePlanWithHotelBase = useCallback(async () => {
    const extracted = extractResponse;
    const nextPreferences = preferencesPayload;
    const controller = abortControllerRef.current;
    const runId = runIdRef.current;

    if (!extracted || !nextPreferences || !controller || controller.signal.aborted) {
      setStatus("error");
      setErrorMessage("Run extraction again before optimizing the hotel base.");
      return;
    }

    setRightPanelTab("agent-run");
    setStatus("optimizing_hotel_base");
    setStreamElapsedSeconds(null);
    setHotelBaseProgressItems([]);

    const hotelPreferences = buildHotelPreferencePayload(
      hotelPreferenceChips,
      hotelPreferenceNotes,
    );

    let nextHotelBase: HotelBaseResult | undefined;
    try {
      nextHotelBase = await streamHotelBase(
        {
          places: extracted.places,
          preferences: nextPreferences,
          hotel_preferences: hotelPreferences,
        },
        {
          signal: controller.signal,
          onEvent: handleHotelBaseStreamEvent,
        },
      );
      if (runIdRef.current !== runId || controller.signal.aborted) {
        return;
      }
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }

      pushLog(
        "Hotel base fallback",
        `${getErrorMessage(error)} Continuing itinerary planning without a selected hotel base.`,
        "warning",
      );
      pushHotelBaseProgress(
        "Fallback",
        "Hotel-base optimization failed, so the planner will continue with your hotel preferences.",
        "success",
      );

      const fallbackPreferences = appendHotelPreferenceSignal(nextPreferences, hotelPreferences);
      await streamFinalItineraryWithErrorHandling({
        extractedPlaces: extracted.places,
        preferences: fallbackPreferences,
        controller,
        isRunCurrent: () => runIdRef.current === runId,
        onStreamEvent: handleStreamEvent,
        onTripReady: (trip) => {
          setFinalTrip(trip);
          setSelectedPlaceId(trip.places[0]?.id ?? null);
          setStatus("trip_ready");
        },
        setStatus,
        setErrorMessage,
        pushLog,
      });
      return;
    }

    await streamFinalItineraryWithErrorHandling({
      extractedPlaces: extracted.places,
      preferences: nextPreferences,
      hotelBase: nextHotelBase,
      controller,
      isRunCurrent: () => runIdRef.current === runId,
      onStreamEvent: handleStreamEvent,
      onTripReady: (trip) => {
        setFinalTrip(trip);
        setSelectedPlaceId(trip.places[0]?.id ?? null);
        setStatus("trip_ready");
      },
      setStatus,
      setErrorMessage,
      pushLog,
    });
  }, [
    extractResponse,
    handleHotelBaseStreamEvent,
    handleStreamEvent,
    hotelPreferenceChips,
    hotelPreferenceNotes,
    preferencesPayload,
    pushHotelBaseProgress,
    pushLog,
  ]);

  const handleGenerate = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      const reelUrls = parseReelUrls(reelInput);
      if (reelUrls.length === 0) {
        setStatus("error");
        setErrorMessage("Paste at least one Instagram Reel URL.");
        return;
      }

      if (reelUrls.length > 4) {
        setStatus("error");
        setErrorMessage("Use 1-4 Reel URLs for this demo flow.");
        return;
      }

      if (startDate > endDate) {
        setStatus("error");
        setErrorMessage("End date must be after the start date.");
        return;
      }

      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;
      const runId = runIdRef.current + 1;
      runIdRef.current = runId;
      const formValues = {
        reelUrls,
        startDate,
        endDate,
        budgetLevel,
        originCity,
        preferences,
      };
      const basePreferences = buildPreferencesPayload(formValues);
      const nextPreferences = appendSteeringSignal(
        basePreferences,
        buildSteeringSignal(
          {
            lockedHotelBase,
            lockedPlaceIds,
            priorityThemes,
            regenerateDay,
            steeringNotes,
          },
          finalTrip ?? provisionalTrip,
        ),
      );

      setErrorMessage(null);
      setExtractResponse(null);
      setPreferencesPayload(nextPreferences);
      setProvisionalTrip(null);
      setFinalTrip(null);
      setSelectedPlaceId(null);
      setRightPanelTab("agent-run");
      setStreamElapsedSeconds(null);
      setHotelBaseProgressItems([]);
      setLogs([]);

      try {
        setStatus("extracting_places");
        pushLog(
          "Reading Reels",
          "The backend is scraping captions and creator location signals.",
          "info",
        );

        const extracted = await extractReelPlaces(reelUrls, controller.signal);
        if (runIdRef.current !== runId || controller.signal.aborted) {
          return;
        }

        const provisional = buildProvisionalTrip(extracted.places, nextPreferences);
        if (provisional.places.length === 0) {
          throw new Error("Extraction finished, but no places had valid coordinates.");
        }

        setExtractResponse(extracted);
        setProvisionalTrip(provisional);
        setSelectedPlaceId(provisional.places[0]?.id ?? null);
        setRightPanelTab("agent-run");
        pushLog(
          "Places mapped",
          `${provisional.places.length} geocoded places are ready for the map.`,
          extracted.source === "cache" ? "warning" : "success",
        );

        setStatus("zooming_to_destination");
        await waitForRegionFocus();
        if (runIdRef.current !== runId || controller.signal.aborted) {
          return;
        }

        setStatus("choosing_hotel_base");
        pushLog(
          "Hotel-base decision",
          "The mapped places are ready for base-area optimization.",
          "info",
        );
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        setStatus("error");
        setErrorMessage(getErrorMessage(error));
        pushLog("Generation stopped", getErrorMessage(error), "error");
      }
    },
    [
      budgetLevel,
      endDate,
      finalTrip,
      lockedHotelBase,
      lockedPlaceIds,
      originCity,
      preferences,
      priorityThemes,
      pushLog,
      reelInput,
      regenerateDay,
      startDate,
      steeringNotes,
      provisionalTrip,
      waitForRegionFocus,
    ],
  );

  if (!mapboxToken) {
    return <MissingMapboxToken />;
  }

  if (status === "trip_ready" && finalTrip) {
    return (
      <TripCanvasShell
        trip={finalTrip}
        hotelBase={finalTrip.hotelBase}
        dataNotice={cacheNotice}
        lockedPlaceIds={lockedPlaceIds}
        onTogglePlaceLock={handleToggleSelectedPlaceLock}
        onRequestRegenerateDay={handleRequestRegenerateDay}
        rightPanel={({ selectedPlace: shellSelectedPlace, days }) => (
          <AgentDecisionRail
            status={status}
            logs={logs}
            elapsedSeconds={streamElapsedSeconds}
            extractResponse={extractResponse}
            preferences={preferencesPayload}
            selectedPlace={shellSelectedPlace}
            days={days}
            hotelBase={finalTrip.hotelBase}
            steering={{
              lockedHotelBase,
              lockedPlaceIds,
              priorityThemes,
              regenerateDay,
              steeringNotes,
            }}
            onToggleHotelBaseLock={handleToggleHotelBaseLock}
            onTogglePlaceLock={handleToggleSelectedPlaceLock}
            onTogglePriorityTheme={handleTogglePriorityTheme}
            onRequestRegenerateDay={handleRequestRegenerateDay}
            onAddSteeringNote={handleAddSteeringNote}
          />
        )}
      />
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#03050c] text-white">
      <TripMap
        mode={mapMode}
        mapboxToken={mapboxToken}
        center={mapCenter}
        initialZoom={activeTrip.destination.zoom}
        days={activeTrip.days}
        selectedDay="all"
        places={activeTrip.places}
        selectedPlace={selectedPlace}
        onSelectPlace={handleSelectPlace}
        onRegionFocusComplete={handleRegionFocusComplete}
      />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_36%,rgba(20,184,166,0.1),transparent_34%),linear-gradient(180deg,rgba(2,6,23,0.12),rgba(2,6,23,0.66))]" />
      {!landingRevealed && status === "idle_globe" ? (
        <StarfieldLanding onReveal={() => setLandingRevealed(true)} />
      ) : null}
      {cacheNotice ? <SourceBadge label={cacheNotice} /> : null}
      <section
        className={[
          "absolute left-4 top-4 z-10 w-[calc(100vw-2rem)] max-w-[540px] transition duration-500 md:left-8 md:top-8",
          !landingRevealed || status === "zooming_to_destination"
            ? "pointer-events-none -translate-y-3 opacity-0"
            : "opacity-100",
        ].join(" ")}
      >
        <ReelInputPanel
          reelInput={reelInput}
          startDate={startDate}
          endDate={endDate}
          budgetLevel={budgetLevel}
          originCity={originCity}
          preferences={preferences}
          isBusy={isBusy}
          errorMessage={status === "error" ? errorMessage : null}
          onSubmit={handleGenerate}
          onReelInputChange={setReelInput}
          onStartDateChange={setStartDate}
          onEndDateChange={setEndDate}
          onBudgetLevelChange={setBudgetLevel}
          onOriginCityChange={setOriginCity}
          onPreferencesChange={setPreferences}
        />
        <GenerationTimeline status={status} hasPlaces={activeTrip.places.length > 0} />
      </section>
      {status === "choosing_hotel_base" || status === "optimizing_hotel_base" ? (
        <section className="absolute bottom-5 left-4 right-4 z-20 max-h-[54vh] overflow-y-auto rounded-2xl border border-white/10 bg-slate-950/86 p-5 shadow-2xl shadow-black/40 backdrop-blur-xl lg:hidden">
          <HotelBasePanel
            selectedChips={hotelPreferenceChips}
            notes={hotelPreferenceNotes}
            isRunning={status === "optimizing_hotel_base"}
            placeCount={activeTrip.places.length}
            elapsedSeconds={streamElapsedSeconds}
            progressItems={hotelBaseProgressItems}
            onToggleChip={handleToggleHotelPreferenceChip}
            onNotesChange={setHotelPreferenceNotes}
            onContinue={handlePlanWithHotelBase}
          />
        </section>
      ) : null}
      {status === "planning_itinerary" ? (
        <section className="absolute bottom-5 left-4 right-4 z-20 max-h-[44vh] overflow-y-auto rounded-2xl border border-white/10 bg-slate-950/86 p-5 shadow-2xl shadow-black/40 backdrop-blur-xl lg:hidden">
          <AgentDecisionRail
            status={status}
            logs={logs}
            elapsedSeconds={streamElapsedSeconds}
            extractResponse={extractResponse}
            preferences={preferencesPayload}
            selectedPlace={selectedPlace}
            days={activeTrip.days}
            hotelBase={activeTrip.hotelBase}
            steering={{
              lockedHotelBase,
              lockedPlaceIds,
              priorityThemes,
              regenerateDay,
              steeringNotes,
            }}
            onToggleHotelBaseLock={handleToggleHotelBaseLock}
            onTogglePlaceLock={handleToggleSelectedPlaceLock}
            onTogglePriorityTheme={handleTogglePriorityTheme}
            onRequestRegenerateDay={handleRequestRegenerateDay}
            onAddSteeringNote={handleAddSteeringNote}
          />
        </section>
      ) : null}
      {status !== "idle_globe" ? (
        <RightTripPanel
          activeTab={rightPanelTab}
          agentPanelContent={
            status === "choosing_hotel_base" || status === "optimizing_hotel_base" ? (
              <HotelBasePanel
                selectedChips={hotelPreferenceChips}
                notes={hotelPreferenceNotes}
                isRunning={status === "optimizing_hotel_base"}
                placeCount={activeTrip.places.length}
                elapsedSeconds={streamElapsedSeconds}
                progressItems={hotelBaseProgressItems}
                onToggleChip={handleToggleHotelPreferenceChip}
                onNotesChange={setHotelPreferenceNotes}
                onContinue={handlePlanWithHotelBase}
              />
            ) : (
              <AgentDecisionRail
                status={status}
                logs={logs}
                elapsedSeconds={streamElapsedSeconds}
                extractResponse={extractResponse}
                preferences={preferencesPayload}
                selectedPlace={selectedPlace}
                days={activeTrip.days}
                hotelBase={activeTrip.hotelBase}
                steering={{
                  lockedHotelBase,
                  lockedPlaceIds,
                  priorityThemes,
                  regenerateDay,
                  steeringNotes,
                }}
                onToggleHotelBaseLock={handleToggleHotelBaseLock}
                onTogglePlaceLock={handleToggleSelectedPlaceLock}
                onTogglePriorityTheme={handleTogglePriorityTheme}
                onRequestRegenerateDay={handleRequestRegenerateDay}
                onAddSteeringNote={handleAddSteeringNote}
              />
            )
          }
          days={activeTrip.days}
          selectedPlace={selectedPlace}
          lockedPlaceIds={lockedPlaceIds}
          onTogglePlaceLock={handleToggleSelectedPlaceLock}
          onRequestRegenerateDay={handleRequestRegenerateDay}
          onSelectTab={setRightPanelTab}
        />
      ) : null}
      <SelectedPlaceCard
        place={selectedPlace}
        days={activeTrip.days}
        locked={selectedPlace ? lockedPlaceIds.has(selectedPlace.id) : false}
        onToggleLock={handleToggleSelectedPlaceLock}
        onViewIntel={handleViewIntel}
      />
      <BottomPlaceRail
        places={activeTrip.places}
        selectedPlaceId={selectedPlaceId}
        lockedPlaceIds={lockedPlaceIds}
        onSelectPlace={handleSelectPlace}
      />
    </main>
  );
}

function ReelInputPanel({
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
}: {
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
}) {
  return (
    <form
      onSubmit={onSubmit}
      className="rounded-2xl border border-white/12 bg-slate-950/80 p-6 shadow-2xl shadow-black/45 backdrop-blur-xl"
    >
      <p className="text-xs font-black uppercase tracking-[0.34em] text-amber-200">
        TripCanvas
      </p>
      <h1 className="mt-3 text-4xl font-black tracking-tight text-white">
        Turn saved Reels into a live trip map
      </h1>
      <p className="mt-4 max-w-xl text-sm font-semibold leading-6 text-slate-300">
        Paste travel Reels and let the agent extract real places, zoom the globe, and build the itinerary.
      </p>

      <label className="mt-6 block">
        <span className="text-xs font-black uppercase tracking-[0.22em] text-slate-400">
          Instagram Reel URLs
        </span>
        <textarea
          value={reelInput}
          onChange={(event) => onReelInputChange(event.target.value)}
          disabled={isBusy}
          rows={4}
          placeholder="https://www.instagram.com/reel/..."
          className="mt-3 min-h-[118px] w-full resize-none rounded-xl border border-white/10 bg-white/10 px-4 py-3 text-sm font-semibold leading-6 text-white outline-none transition placeholder:text-slate-500 focus:border-amber-200/60 disabled:cursor-not-allowed disabled:opacity-60"
        />
      </label>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
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

      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1.1fr]">
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

      <label className="mt-4 block">
        <span className="text-xs font-black uppercase tracking-[0.22em] text-slate-400">
          Preferences
        </span>
        <textarea
          value={preferences}
          onChange={(event) => onPreferencesChange(event.target.value)}
          disabled={isBusy}
          rows={3}
          className="mt-3 min-h-[86px] w-full resize-none rounded-xl border border-white/10 bg-white/10 px-4 py-3 text-sm font-semibold leading-6 text-white outline-none transition placeholder:text-slate-500 focus:border-amber-200/60 disabled:cursor-not-allowed disabled:opacity-60"
        />
      </label>

      {errorMessage ? (
        <p className="mt-4 rounded-xl border border-red-300/30 bg-red-400/12 px-4 py-3 text-sm font-semibold leading-6 text-red-100">
          {errorMessage}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isBusy}
        className="mt-5 h-12 w-full rounded-xl border border-amber-100/30 bg-amber-200 px-5 text-base font-black text-slate-950 shadow-xl shadow-amber-950/25 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isBusy ? "Generating trip map" : "Generate trip map"}
      </button>
    </form>
  );
}

async function streamFinalItineraryWithErrorHandling({
  setErrorMessage,
  ...options
}: Parameters<typeof streamFinalItinerary>[0] & {
  setErrorMessage: (message: string) => void;
}) {
  try {
    await streamFinalItinerary(options);
  } catch (error) {
    if (options.controller.signal.aborted) {
      return;
    }

    options.setStatus("error");
    setErrorMessage(getErrorMessage(error));
    options.pushLog("Generation stopped", getErrorMessage(error), "error");
  }
}

async function streamFinalItinerary({
  extractedPlaces,
  preferences,
  hotelBase,
  controller,
  onStreamEvent,
  isRunCurrent,
  onTripReady,
  setStatus,
  pushLog,
}: {
  extractedPlaces: BackendExtractedPlace[];
  preferences: UserPreferencesPayload;
  hotelBase?: HotelBaseResult;
  controller: AbortController;
  onStreamEvent: (event: ItineraryStreamEvent) => void;
  isRunCurrent: () => boolean;
  onTripReady: (trip: TripExperience) => void;
  setStatus: (status: GenerationStatus) => void;
  pushLog: (title: string, detail: string, tone: GenerationLog["tone"]) => void;
}) {
  setStatus("planning_itinerary");
  pushLog(
    "Researching itinerary",
    "The planner is checking hotels, weather, flights, and place context.",
    "info",
  );

  const itinerary = await streamItinerary(
    {
      places: extractedPlaces,
      preferences,
      ...(hotelBase ? { hotel_base: hotelBase } : {}),
    },
    {
      signal: controller.signal,
      onEvent: onStreamEvent,
    },
  );
  if (!isRunCurrent() || controller.signal.aborted) {
    return;
  }

  const trip = buildFinalTrip(extractedPlaces, itinerary, preferences, hotelBase);
  if (!isRunCurrent() || controller.signal.aborted) {
    return;
  }

  onTripReady(trip);
}

function appendHotelPreferenceSignal(
  preferences: UserPreferencesPayload,
  hotelPreferences: HotelPreferencePayload,
): UserPreferencesPayload {
  const hotelSignal = formatHotelPreferenceSignal(hotelPreferences);
  if (!hotelSignal) {
    return preferences;
  }

  return {
    ...preferences,
    free_text: [preferences.free_text, hotelSignal].filter(Boolean).join("\n\n"),
  };
}

function formatHotelPreferenceSignal(hotelPreferences: HotelPreferencePayload) {
  const chipLabels = hotelPreferences.chips
    .map((chip) => HOTEL_BASE_CHIPS.find((item) => item.id === chip)?.label ?? chip)
    .filter(Boolean);
  const parts = [
    hotelPreferences.optimize_for_me ? "optimize hotel base for me" : "",
    chipLabels.length > 0 ? `hotel base priorities: ${chipLabels.join(", ")}` : "",
    hotelPreferences.free_text ? `hotel notes: ${hotelPreferences.free_text}` : "",
  ].filter(Boolean);

  return parts.length > 0 ? `Hotel preferences: ${parts.join("; ")}.` : "";
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">
        {label}
      </span>
      <div className="mt-2">{children}</div>
    </label>
  );
}

function GenerationTimeline({
  status,
  hasPlaces,
}: {
  status: GenerationStatus;
  hasPlaces: boolean;
}) {
  const steps = [
    {
      key: "extract",
      label: "Extract places",
      active: status === "extracting_places",
      done: hasPlaces,
    },
    {
      key: "zoom",
      label: "Zoom to region",
      active: status === "zooming_to_destination",
      done: hasPlaces && status !== "zooming_to_destination" && status !== "extracting_places",
    },
    {
      key: "base",
      label: "Choose base",
      active: status === "choosing_hotel_base" || status === "optimizing_hotel_base",
      done: status === "planning_itinerary" || status === "trip_ready",
    },
    {
      key: "plan",
      label: "Plan itinerary",
      active: status === "planning_itinerary",
      done: status === "trip_ready",
    },
    {
      key: "map",
      label: "Render map",
      active: status === "trip_ready",
      done: status === "trip_ready",
    },
  ];

  return (
    <div className="mt-4 rounded-2xl border border-white/10 bg-slate-950/72 p-4 shadow-2xl shadow-black/30 backdrop-blur-xl">
      <div className="grid gap-3 sm:grid-cols-5">
        {steps.map((step) => (
          <div
            key={step.key}
            className={[
              "rounded-xl border px-3 py-3",
              step.done
                ? "border-teal-200/30 bg-teal-300/12 text-teal-100"
                : step.active
                  ? "border-amber-200/40 bg-amber-200/14 text-amber-100"
                  : "border-white/10 bg-white/6 text-slate-400",
            ].join(" ")}
          >
            <div className="flex items-center gap-2">
              <span
                className={[
                  "h-2.5 w-2.5 rounded-full",
                  step.done
                    ? "bg-teal-200"
                    : step.active
                      ? "animate-pulse bg-amber-200"
                      : "bg-slate-600",
                ].join(" ")}
              />
              <p className="text-xs font-black uppercase tracking-[0.16em]">{step.label}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AgentDecisionRail({
  status,
  logs,
  elapsedSeconds,
  extractResponse,
  preferences,
  selectedPlace,
  days,
  hotelBase,
  steering,
  onToggleHotelBaseLock,
  onTogglePlaceLock,
  onTogglePriorityTheme,
  onRequestRegenerateDay,
  onAddSteeringNote,
}: {
  status: GenerationStatus;
  logs: GenerationLog[];
  elapsedSeconds: number | null;
  extractResponse: ExtractResponse | null;
  preferences: UserPreferencesPayload | null;
  selectedPlace: TripPlace | null;
  days: TripDay[];
  hotelBase?: TripHotelBase;
  steering: SteeringState;
  onToggleHotelBaseLock: () => void;
  onTogglePlaceLock: (placeId: string) => void;
  onTogglePriorityTheme: (theme: string) => void;
  onRequestRegenerateDay: (day: number) => void;
  onAddSteeringNote: (note: string) => void;
}) {
  const [draftNote, setDraftNote] = useState("");

  if (status === "idle_globe") {
    return null;
  }

  const selectedDay = selectedPlace
    ? days.find((day) => day.day === selectedPlace.day) ?? null
    : null;
  const selectedPlaceLocked = selectedPlace ? steering.lockedPlaceIds.has(selectedPlace.id) : false;
  const hasSteering =
    steering.lockedHotelBase ||
    steering.lockedPlaceIds.size > 0 ||
    steering.priorityThemes.length > 0 ||
    steering.regenerateDay !== null ||
    steering.steeringNotes.length > 0;

  const handleSubmitNote = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onAddSteeringNote(draftNote);
    setDraftNote("");
  };

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.28em] text-teal-200">
            Agent decision
          </p>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-white">
            {getAgentPanelTitle(status)}
          </h2>
        </div>
        {elapsedSeconds !== null ? (
          <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-bold text-slate-200">
            {elapsedSeconds.toFixed(1)}s
          </span>
        ) : null}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <Metric label="Places" value={String(extractResponse?.count ?? "-")} />
        <Metric label="Source" value={extractResponse?.source ?? "-"} />
        <Metric label="Dates" value={preferences ? `${preferences.start_date.slice(5)}-${preferences.end_date.slice(5)}` : "-"} />
        <Metric label="Budget" value={preferences?.budget_level.replace("_", " ") ?? "-"} />
      </div>

      <div className="mt-5 space-y-3">
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

      <div className="mt-5 space-y-3 rounded-xl border border-white/10 bg-white/6 p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">
            Steering
          </p>
          <span className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-100">
            Will apply on next generation
          </span>
        </div>

        <div className="grid gap-2">
          <SteeringButton
            active={steering.lockedHotelBase}
            disabled={!hotelBase}
            onClick={onToggleHotelBaseLock}
          >
            Lock hotel base
          </SteeringButton>
          {selectedPlace ? (
            <SteeringButton
              active={selectedPlaceLocked}
              onClick={() => onTogglePlaceLock(selectedPlace.id)}
            >
              {selectedPlaceLocked ? "Stop locked" : "Lock selected stop"}
            </SteeringButton>
          ) : null}
          {selectedPlace ? (
            <SteeringButton
              active={steering.regenerateDay === selectedPlace.day}
              onClick={() => onRequestRegenerateDay(selectedPlace.day)}
            >
              Regenerate Day {selectedPlace.day}
            </SteeringButton>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          {PRIORITY_THEMES.map((theme) => (
            <button
              key={theme.id}
              type="button"
              onClick={() => onTogglePriorityTheme(theme.id)}
              className={[
                "rounded-full border px-3 py-2 text-xs font-black transition",
                steering.priorityThemes.includes(theme.id)
                  ? "border-amber-200/55 bg-amber-200/18 text-amber-100"
                  : "border-white/10 bg-white/8 text-slate-200 hover:bg-white/12",
              ].join(" ")}
            >
              Prioritize {theme.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmitNote}>
          <label className="block">
            <span className="sr-only">Steering note</span>
            <textarea
              value={draftNote}
              onChange={(event) => setDraftNote(event.target.value)}
              rows={2}
              placeholder="Tell the agent what to prioritize next..."
              className="min-h-[72px] w-full resize-none rounded-xl border border-white/10 bg-white/10 px-3 py-3 text-sm font-semibold leading-5 text-white outline-none transition placeholder:text-slate-500 focus:border-amber-200/60"
            />
          </label>
          <button
            type="submit"
            disabled={!draftNote.trim()}
            className="mt-2 h-9 w-full rounded-lg border border-amber-200/35 bg-amber-200/14 px-3 text-xs font-black uppercase tracking-[0.16em] text-amber-100 transition hover:bg-amber-200/22 disabled:cursor-not-allowed disabled:opacity-45"
          >
            Save steering note
          </button>
        </form>

        {hasSteering ? (
          <div className="space-y-2 text-sm font-semibold leading-5 text-slate-300">
            {steering.lockedHotelBase ? <SteeringStateLine>Hotel base locked</SteeringStateLine> : null}
            {steering.lockedPlaceIds.size > 0 ? (
              <SteeringStateLine>{steering.lockedPlaceIds.size} stop locked</SteeringStateLine>
            ) : null}
            {steering.priorityThemes.length > 0 ? (
              <SteeringStateLine>
                Priorities: {steering.priorityThemes.map(formatPriorityTheme).join(", ")}
              </SteeringStateLine>
            ) : null}
            {steering.regenerateDay !== null ? (
              <SteeringStateLine>Regenerate Day {steering.regenerateDay}</SteeringStateLine>
            ) : null}
            {steering.steeringNotes.slice(-2).map((note) => (
              <SteeringStateLine key={note}>{note}</SteeringStateLine>
            ))}
          </div>
        ) : null}
      </div>

      <div className="mt-5 space-y-3">
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">
          Recent events
        </p>
        {logs.length === 0 ? (
          <p className="rounded-xl border border-white/10 bg-white/8 px-4 py-3 text-sm font-semibold leading-6 text-slate-300">
            Waiting for the first backend event.
          </p>
        ) : (
          logs.slice(-4).map((log) => (
            <div
              key={log.id}
              className={[
                "rounded-xl border px-4 py-3",
                log.tone === "success"
                  ? "border-teal-200/25 bg-teal-300/10"
                  : log.tone === "warning"
                    ? "border-amber-200/30 bg-amber-200/12"
                    : log.tone === "error"
                      ? "border-red-300/30 bg-red-400/12"
                      : "border-white/10 bg-white/8",
              ].join(" ")}
            >
              <p className="text-sm font-black text-white">{log.title}</p>
              <p className="mt-1 text-sm font-semibold leading-6 text-slate-300">
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
    <section className={`rounded-xl border px-4 py-3 ${toneClass}`}>
      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold leading-6 text-slate-200">{value}</p>
    </section>
  );
}

function SteeringButton({
  active,
  disabled,
  children,
  onClick,
}: {
  active: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={[
        "h-10 rounded-xl border px-3 text-xs font-black uppercase tracking-[0.14em] transition disabled:cursor-not-allowed disabled:opacity-40",
        active
          ? "border-teal-200/45 bg-teal-300/14 text-teal-100"
          : "border-white/10 bg-white/8 text-slate-200 hover:bg-white/12",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function SteeringStateLine({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-white/8 bg-slate-950/38 px-3 py-2">
      {children}
    </p>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/8 px-3 py-3">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 truncate text-sm font-black capitalize text-slate-100">{value}</p>
    </div>
  );
}

function SourceBadge({ label }: { label: string }) {
  return (
    <div className="pointer-events-none absolute right-3 top-3 z-20 rounded-full border border-amber-200/30 bg-slate-950/[0.78] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-amber-100 shadow-2xl shadow-black/30 backdrop-blur-xl lg:right-[430px]">
      {label}
    </div>
  );
}

function MissingMapboxToken() {
  return (
    <main className="min-h-screen bg-[#06070a] text-white">
      <div className="flex min-h-screen items-center justify-center px-6">
        <section className="w-full max-w-lg rounded-2xl border border-white/[0.12] bg-white/[0.07] p-8 shadow-2xl shadow-black/40 backdrop-blur-xl">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.28em] text-amber-200">
            Map token required
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">TripCanvas needs Mapbox</h1>
          <p className="mt-4 text-sm leading-6 text-slate-300">
            Add a public Mapbox token to{" "}
            <code className="rounded bg-white/10 px-1.5 py-1 text-amber-100">
              frontend/.env.local
            </code>{" "}
            and restart the Next.js dev server.
          </p>
          <pre className="mt-5 overflow-x-auto rounded-xl border border-white/10 bg-black/[0.35] p-4 text-sm text-slate-200">
            NEXT_PUBLIC_MAPBOX_TOKEN=your_mapbox_public_token_here
          </pre>
        </section>
      </div>
    </main>
  );
}

function getMapMode(status: GenerationStatus, provisionalTrip: TripExperience | null): TripMapMode {
  if (!provisionalTrip || status === "idle_globe" || status === "extracting_places") {
    return "globe";
  }

  if (status === "zooming_to_destination") {
    return "extracting";
  }

  return "trip";
}

function getAgentPanelTitle(status: GenerationStatus) {
  if (status === "extracting_places") {
    return "Finding real places";
  }

  if (status === "zooming_to_destination") {
    return "Grounding the map";
  }

  if (status === "planning_itinerary") {
    return "Researching the trip";
  }

  if (status === "choosing_hotel_base" || status === "optimizing_hotel_base") {
    return "Choosing the base";
  }

  if (status === "trip_ready") {
    return "Trip ready";
  }

  if (status === "error") {
    return "Needs attention";
  }

  return "Preparing";
}

function buildDecisionSummary(
  status: GenerationStatus,
  selectedPlace: TripPlace | null,
  hotelBase: TripHotelBase | undefined,
  logs: GenerationLog[],
) {
  if (selectedPlace) {
    return `${selectedPlace.name} is the active artifact. The planner placed it on Day ${selectedPlace.day} so the map, rail, and place intel can be reviewed together.`;
  }

  if (hotelBase) {
    return `Selected ${hotelBase.selectedBaseName} as the trip base and ${hotelBase.selectedHotelName} as the hotel candidate.`;
  }

  const latestLog = logs.at(-1);
  if (latestLog) {
    return latestLog.detail;
  }

  if (status === "extracting_places") {
    return "Reading Reel captions and location signals before grounding places on the map.";
  }

  return "Waiting for the backend agent to produce the next visible decision.";
}

function buildEvidenceSummary(
  selectedPlace: TripPlace | null,
  extractResponse: ExtractResponse | null,
) {
  if (selectedPlace?.evidenceQuote) {
    return truncateText(`Reel evidence: "${selectedPlace.evidenceQuote}"`, 150);
  }

  if (typeof selectedPlace?.confidence === "number") {
    return `Extraction confidence is ${Math.round(selectedPlace.confidence * 100)}%.`;
  }

  if (extractResponse) {
    return `${extractResponse.count} extracted places are using ${extractResponse.source} source data.`;
  }

  return "No source evidence has been returned yet.";
}

function buildTradeoffSummary(
  selectedPlace: TripPlace | null,
  selectedDay: TripDay | null,
  hotelBase: TripHotelBase | undefined,
) {
  if (selectedPlace) {
    const text = [
      selectedPlace.plannerSummary,
      selectedPlace.dayPlanText,
      selectedDay?.summary,
      selectedDay?.weatherStrategy,
    ]
      .filter(Boolean)
      .join(" ");
    const tradeoff = findRelevantSentence(text, [
      "tradeoff",
      "long",
      "walk",
      "transit",
      "station",
      "weather",
      "rain",
      "dry",
      "far",
      "route",
    ]);

    if (tradeoff) {
      return truncateText(tradeoff, 150);
    }

    if (selectedPlace.address) {
      return `Routing detail is limited; use the mapped address for transit review: ${selectedPlace.address}.`;
    }

    return "No explicit route or timing tradeoff was returned for this stop.";
  }

  if (hotelBase?.selectedBaseRationale) {
    return truncateText(hotelBase.selectedBaseRationale, 150);
  }

  return "Tradeoffs will appear once a hotel base or mapped stop is selected.";
}

function buildNextActionSummary(
  status: GenerationStatus,
  selectedPlace: TripPlace | null,
  steering: SteeringState,
) {
  if (status === "error") {
    return "Fix the input or retry the generation flow.";
  }

  if (status === "planning_itinerary") {
    return "Wait for the planner result; steering edits will be saved for the next run.";
  }

  if (selectedPlace) {
    return steering.lockedPlaceIds.has(selectedPlace.id)
      ? `Review ${selectedPlace.name}, or unlock it before the next generation.`
      : `Lock ${selectedPlace.name}, request a Day ${selectedPlace.day} regeneration, or add a steering note.`;
  }

  if (status === "choosing_hotel_base") {
    return "Choose hotel-base priorities, then let the optimizer score the mapped places.";
  }

  return "Select a mapped stop to inspect the agent rationale and steering controls.";
}

function appendSteeringSignal(
  preferences: UserPreferencesPayload,
  steeringSignal: string,
): UserPreferencesPayload {
  if (!steeringSignal) {
    return preferences;
  }

  return {
    ...preferences,
    free_text: [preferences.free_text, steeringSignal].filter(Boolean).join("\n\n"),
  };
}

function buildSteeringSignal(steering: SteeringState, trip: TripExperience | null) {
  const lockedPlaceNames =
    trip?.places
      .filter((place) => steering.lockedPlaceIds.has(place.id))
      .map((place) => place.name) ?? [];
  const parts = [
    steering.lockedHotelBase
      ? "Keep the current hotel base unless it creates a major route issue."
      : "",
    lockedPlaceNames.length > 0
      ? `Keep these stops if still relevant: ${lockedPlaceNames.join(", ")}.`
      : "",
    steering.priorityThemes.length > 0
      ? `Prioritize ${steering.priorityThemes.map(formatPriorityTheme).join(", ")} tradeoffs.`
      : "",
    steering.regenerateDay !== null
      ? `Rework Day ${steering.regenerateDay} with better sequencing.`
      : "",
    steering.steeringNotes.length > 0
      ? `User steering notes: ${steering.steeringNotes.join(" | ")}.`
      : "",
  ].filter(Boolean);

  return parts.length > 0 ? `Agent steering for next run: ${parts.join(" ")}` : "";
}

function formatPriorityTheme(theme: string) {
  return PRIORITY_THEMES.find((item) => item.id === theme)?.label ?? theme;
}

function findRelevantSentence(text: string, keywords: string[]) {
  return splitSentences(text).find((sentence) => {
    const lower = sentence.toLowerCase();
    return keywords.some((keyword) => lower.includes(keyword));
  }) ?? "";
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

function parseReelUrls(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[\s,]+/)
        .map((url) => url.trim())
        .filter(Boolean),
    ),
  );
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Something went wrong while generating the trip.";
}

function readStreamEventRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readStreamEventString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readStreamEventNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
