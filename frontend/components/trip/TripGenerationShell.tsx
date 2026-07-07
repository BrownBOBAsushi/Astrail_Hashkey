"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { TripMap } from "@/components/map/TripMap";
import { AgentDecisionRail } from "@/components/trip/AgentDecisionRail";
import { BottomPlaceRail } from "@/components/trip/BottomPlaceRail";
import { GenerationTimeline } from "@/components/trip/GenerationTimeline";
import {
  buildHotelPreferencePayload,
  HotelBasePanel,
  HOTEL_BASE_CHIPS,
  type HotelBaseProgressItem,
} from "@/components/trip/HotelBasePanel";
import { ReelInputPanel } from "@/components/trip/ReelInputPanel";
import { RightTripPanel, type RightPanelTab } from "@/components/trip/RightTripPanel";
import { SelectedPlaceCard } from "@/components/trip/SelectedPlaceCard";
import { AstrailShell } from "@/components/trip/AstrailShell";
import {
  INITIAL_BOOKING_FLOW_STATE,
  buildBookingLogDetail,
  buildMandateLogDetail,
  type BookingFlowState,
} from "@/lib/trip/booking-flow";
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
  DEMO_REEL_INPUT,
  loadBackendDemoCache,
} from "@/lib/trip/demo-cache";
import {
  buildFinalTrip,
  buildPreferencesPayload,
  buildProvisionalTrip,
  extractReelPlaces,
  streamHotelBase,
  streamItinerary,
} from "@/lib/trip/generate-trip";
import {
  requestHotelBookingMandate,
  submitHotelBooking,
} from "@/lib/trip/hotel-booking";
import { readPublicMapboxToken } from "@/lib/trip/env";
import {
  appendSteeringSignal,
  buildSteeringSignal,
  getBackendErrorMessage,
  getErrorMessage,
  getMapMode,
  parseReelUrls,
  readStreamEventNumber,
  readStreamEventRecord,
  readStreamEventString,
  type GenerationLog,
  type GenerationStatus,
} from "@/lib/trip/generation-state";
import type { DayFilter, TripExperience, TripHotelBase, TripPlace } from "@/lib/trip/types";

const DEMO_AP2_TRIP_ID = "astrail-demo-osaka-001";

const EMPTY_GLOBE_TRIP: TripExperience = {
  id: "empty-globe",
  title: "Astrail",
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
  const mapboxToken = readPublicMapboxToken();
  const abortControllerRef = useRef<AbortController | null>(null);
  const focusResolverRef = useRef<(() => void) | null>(null);
  const runIdRef = useRef(0);
  const [status, setStatus] = useState<GenerationStatus>("idle_globe");
  const [reelInput, setReelInput] = useState(DEFAULT_REEL_INPUT);
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
  const [routePreviewPlaceId, setRoutePreviewPlaceId] = useState<string | null>(null);
  const [rightPanelTab, setRightPanelTab] = useState<RightPanelTab>("agent-run");
  const [mobileIntelOpen, setMobileIntelOpen] = useState(false);
  const [logs, setLogs] = useState<GenerationLog[]>([]);
  const [streamElapsedSeconds, setStreamElapsedSeconds] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cacheNotice, setCacheNotice] = useState<string | null>(null);
  const [lockedHotelBase, setLockedHotelBase] = useState(false);
  const [lockedPlaceIds, setLockedPlaceIds] = useState<Set<string>>(() => new Set());
  const [priorityThemes, setPriorityThemes] = useState<string[]>([]);
  const [regenerateDay, setRegenerateDay] = useState<number | null>(null);
  const [steeringNotes, setSteeringNotes] = useState<string[]>([]);
  const [bookingFlow, setBookingFlow] = useState<BookingFlowState>(INITIAL_BOOKING_FLOW_STATE);

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
    setRoutePreviewPlaceId(placeId);
    setMobileIntelOpen(false);
    setRightPanelTab("place-intel");
  }, []);

  const handleViewIntel = useCallback(() => {
    setRightPanelTab("place-intel");
    setMobileIntelOpen(true);
  }, []);

  const handlePreviewRoute = useCallback(
    (placeId: string) => {
      if (!activeTrip.places.some((place) => place.id === placeId)) {
        return;
      }

      setSelectedPlaceId(placeId);
      setRoutePreviewPlaceId(placeId);
      setMobileIntelOpen(true);
      setRightPanelTab("place-intel");
    },
    [activeTrip.places],
  );

  const handleCloseMobileIntel = useCallback(() => {
    setMobileIntelOpen(false);
  }, []);

  const handleSelectTimelineDay = useCallback(
    (day: DayFilter) => {
      if (day === "all") {
        return;
      }

      const firstPlaceForDay = activeTrip.places.find((place) => place.day === day) ?? null;
      if (firstPlaceForDay) {
        handleSelectPlace(firstPlaceForDay.id);
      }
    },
    [activeTrip.places, handleSelectPlace],
  );

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

  const handleRequestBookingMandate = useCallback(async () => {
    setRightPanelTab("agent-run");
    setBookingFlow({
      status: "mandate_signing",
      mandateResponse: null,
      bookingResponse: null,
      errorMessage: null,
    });

    try {
      const mandateResponse = await requestHotelBookingMandate({
        tripId: DEMO_AP2_TRIP_ID,
      });

      if (mandateResponse.status !== "signed" || !mandateResponse.ap2?.signed_mandate) {
        const message = getBackendErrorMessage(
          mandateResponse.error,
          "AP2 mandate was rejected by the backend.",
        );
        setBookingFlow({
          status: "rejected",
          mandateResponse,
          bookingResponse: null,
          errorMessage: message,
        });
        pushLog("AP2 mandate rejected", message, "error");
        return;
      }

      setBookingFlow({
        status: "mandate_ready",
        mandateResponse,
        bookingResponse: null,
        errorMessage: null,
      });
      pushLog(
        "AP2 mandate signed",
        buildMandateLogDetail(mandateResponse),
        "success",
      );
    } catch (error) {
      const message = getErrorMessage(error);
      setBookingFlow({
        status: "failed",
        mandateResponse: null,
        bookingResponse: null,
        errorMessage: message,
      });
      pushLog("AP2 mandate failed", message, "error");
    }
  }, [pushLog]);

  const handleConfirmHotelBooking = useCallback(async () => {
    const mandateResponse = bookingFlow.mandateResponse;
    const signedMandate = mandateResponse?.ap2?.signed_mandate;

    if (!signedMandate) {
      const message = "Create a signed AP2 mandate before submitting the hotel booking.";
      setBookingFlow({
        status: "failed",
        mandateResponse,
        bookingResponse: null,
        errorMessage: message,
      });
      pushLog("Hotel booking blocked", message, "error");
      return;
    }

    setBookingFlow({
      status: "booking_submitting",
      mandateResponse,
      bookingResponse: null,
      errorMessage: null,
    });

    try {
      const bookingResponse = await submitHotelBooking({
        tripId: DEMO_AP2_TRIP_ID,
        signedMandate,
      });

      if (bookingResponse.status === "rejected" || bookingResponse.error) {
        const message = getBackendErrorMessage(
          bookingResponse.error,
          "Hotel booking was rejected by the backend.",
        );
        setBookingFlow({
          status: "rejected",
          mandateResponse,
          bookingResponse,
          errorMessage: message,
        });
        pushLog("Hotel booking rejected", message, "error");
        return;
      }

      if (!bookingResponse.receipt) {
        const message = "Hotel booking response did not include a receipt.";
        setBookingFlow({
          status: "failed",
          mandateResponse,
          bookingResponse,
          errorMessage: message,
        });
        pushLog("Hotel booking failed", message, "error");
        return;
      }

      setBookingFlow({
        status: "confirmed",
        mandateResponse,
        bookingResponse,
        errorMessage: null,
      });
      pushLog(
        "Hotel booking confirmed",
        buildBookingLogDetail(bookingResponse),
        "success",
      );
    } catch (error) {
      const message = getErrorMessage(error);
      setBookingFlow({
        status: "failed",
        mandateResponse,
        bookingResponse: null,
        errorMessage: message,
      });
      pushLog("Hotel booking failed", message, "error");
    }
  }, [bookingFlow.mandateResponse, pushLog]);

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

  const handleUseDemoReels = useCallback(() => {
    setReelInput(DEMO_REEL_INPUT);
    setErrorMessage(null);
    if (status === "error") {
      setStatus("idle_globe");
    }
  }, [status]);

  const handleLoadBackendCache = useCallback(async () => {
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

    const nextReelInput = reelInput.trim() ? reelInput : DEMO_REEL_INPUT;
    setReelInput(nextReelInput);

    const basePreferences = buildPreferencesPayload({
      reelUrls: parseReelUrls(nextReelInput),
      startDate,
      endDate,
      budgetLevel,
      originCity,
      preferences,
    });
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
    setRoutePreviewPlaceId(null);
    setRightPanelTab("agent-run");
    setMobileIntelOpen(false);
    setStreamElapsedSeconds(null);
    setHotelBaseProgressItems([]);
    setLogs([]);
    setCacheNotice(null);
    setBookingFlow(INITIAL_BOOKING_FLOW_STATE);

    try {
      setStatus("planning_itinerary");
      pushLog(
        "Loading backend cache",
        "Replaying the committed places, hotel-base decision, and itinerary cache.",
        "info",
      );

      const cached = await loadBackendDemoCache(controller.signal);
      if (runIdRef.current !== runId || controller.signal.aborted) {
        return;
      }

      const extracted: ExtractResponse = {
        places: cached.places,
        source: cached.source,
        count: cached.places.length,
      };
      const trip = buildFinalTrip(
        cached.places,
        cached.itinerary,
        nextPreferences,
        cached.hotel_base,
      );
      if (trip.places.length === 0) {
        throw new Error("Backend cache loaded, but no places had valid coordinates.");
      }

      setExtractResponse(extracted);
      setFinalTrip(trip);
      setSelectedPlaceId(trip.places[0]?.id ?? null);
      setRoutePreviewPlaceId(trip.places[0]?.id ?? null);
      setCacheNotice("Backend cache");
      pushLog(
        "Backend cache ready",
        `${trip.places.length} mapped stops, ${trip.days.length} days, and the cached hotel-base decision are ready.`,
        "success",
      );
      setStatus("trip_ready");
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }

      setStatus("error");
      setErrorMessage(getErrorMessage(error));
      pushLog("Backend cache unavailable", getErrorMessage(error), "error");
    }
  }, [
    budgetLevel,
    endDate,
    finalTrip,
    lockedHotelBase,
    lockedPlaceIds,
    originCity,
    preferences,
    priorityThemes,
    provisionalTrip,
    pushLog,
    reelInput,
    regenerateDay,
    startDate,
    status,
    steeringNotes,
  ]);

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
          setRoutePreviewPlaceId(trip.places[0]?.id ?? null);
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
        setRoutePreviewPlaceId(trip.places[0]?.id ?? null);
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
      setRoutePreviewPlaceId(null);
      setRightPanelTab("agent-run");
      setMobileIntelOpen(false);
      setStreamElapsedSeconds(null);
      setHotelBaseProgressItems([]);
      setLogs([]);
      setCacheNotice(null);
      setBookingFlow(INITIAL_BOOKING_FLOW_STATE);

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
        setCacheNotice(extracted.source === "cache" ? "Cache fallback" : null);
        setProvisionalTrip(provisional);
        setSelectedPlaceId(provisional.places[0]?.id ?? null);
        setRoutePreviewPlaceId(provisional.places[0]?.id ?? null);
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
      <AstrailShell
        trip={finalTrip}
        hotelBase={finalTrip.hotelBase}
        dataNotice={cacheNotice ?? undefined}
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
            bookingState={bookingFlow}
            onToggleHotelBaseLock={handleToggleHotelBaseLock}
            onTogglePlaceLock={handleToggleSelectedPlaceLock}
            onTogglePriorityTheme={handleTogglePriorityTheme}
            onRequestRegenerateDay={handleRequestRegenerateDay}
            onAddSteeringNote={handleAddSteeringNote}
            onRequestBookingMandate={handleRequestBookingMandate}
            onConfirmHotelBooking={handleConfirmHotelBooking}
          />
        )}
      />
    );
  }

  return (
    <main className="relative h-screen w-full max-w-full overflow-hidden bg-[#081016] text-white">
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
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,23,0.08),rgba(2,6,23,0.62))]" />
      {cacheNotice ? <SourceBadge label={cacheNotice} /> : null}
      <section
        className={[
          "absolute left-3 top-3 z-10 max-h-[calc(100vh-1rem)] w-[calc(100vw-1.5rem)] max-w-[360px] overflow-y-auto overflow-x-hidden pb-3 pr-1 transition duration-500 md:left-4 md:top-4 lg:max-w-[380px] 2xl:max-w-[400px]",
          status === "zooming_to_destination"
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
          onUseDemoReels={handleUseDemoReels}
          onLoadBackendCache={handleLoadBackendCache}
        />
        <GenerationTimeline status={status} hasPlaces={activeTrip.places.length > 0} />
      </section>
      {status === "choosing_hotel_base" || status === "optimizing_hotel_base" ? (
        <section className="absolute bottom-3 left-3 right-3 z-20 max-h-[42vh] overflow-y-auto rounded-xl border border-white/10 bg-slate-950/84 p-3 shadow-2xl shadow-black/35 backdrop-blur-xl lg:hidden">
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
        <section className="absolute bottom-3 left-3 right-3 z-20 max-h-[38vh] overflow-y-auto rounded-xl border border-white/10 bg-slate-950/84 p-3 shadow-2xl shadow-black/35 backdrop-blur-xl lg:hidden">
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
          places={activeTrip.places}
          selectedPlace={selectedPlace}
          routePreviewPlaceId={routePreviewPlaceId}
          mobileIntelOpen={mobileIntelOpen}
          lockedPlaceIds={lockedPlaceIds}
          onTogglePlaceLock={handleToggleSelectedPlaceLock}
          onPreviewRoute={handlePreviewRoute}
          onRequestRegenerateDay={handleRequestRegenerateDay}
          onCloseMobileIntel={handleCloseMobileIntel}
          onSelectTab={setRightPanelTab}
        />
      ) : null}
      <SelectedPlaceCard
        place={selectedPlace}
        days={activeTrip.days}
        onViewIntel={handleViewIntel}
      />
      <BottomPlaceRail
        days={activeTrip.days}
        places={activeTrip.places}
        selectedPlaceId={selectedPlaceId}
        lockedPlaceIds={lockedPlaceIds}
        onSelectPlace={handleSelectPlace}
        onSelectDay={handleSelectTimelineDay}
      />
    </main>
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

function SourceBadge({ label }: { label: string }) {
  return (
    <div className="pointer-events-none absolute right-3 top-3 z-20 rounded-full border border-amber-200/30 bg-[#101821]/[0.78] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-100 shadow-2xl shadow-black/30 backdrop-blur-xl lg:right-[404px]">
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
          <h1 className="text-3xl font-semibold tracking-tight">Astrail needs Mapbox</h1>
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
