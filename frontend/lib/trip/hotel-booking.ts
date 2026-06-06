import type {
  AP2MandateResponse,
  AP2SignedMandate,
  BackendErrorPayload,
  HotelBookingResponse,
} from "@/lib/trip/backend-types";

type RequestHotelBookingMandateOptions = {
  tripId: string;
  signal?: AbortSignal;
};

type SubmitHotelBookingOptions = {
  tripId: string;
  signedMandate: AP2SignedMandate;
  signal?: AbortSignal;
};

export async function requestHotelBookingMandate({
  tripId,
  signal,
}: RequestHotelBookingMandateOptions): Promise<AP2MandateResponse> {
  const response = await fetch(`${getBackendBaseUrl()}/ap2/hotel-booking-mandate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      trip_id: requireTripId(tripId),
      user_confirmation: {
        confirmed: true,
        button_label: "Confirm Hotel Booking",
        trusted_surface: "tripcanvas-web",
      },
    }),
    signal,
  });

  if (!response.ok) {
    throw new Error(await formatApiError(response, "AP2 mandate request failed"));
  }

  const payload = (await response.json()) as AP2MandateResponse;
  if (payload.status === "signed" && !payload.ap2?.signed_mandate) {
    throw new Error("AP2 mandate response did not include a signed AP2 mandate.");
  }

  return payload;
}

export async function submitHotelBooking({
  tripId,
  signedMandate,
  signal,
}: SubmitHotelBookingOptions): Promise<HotelBookingResponse> {
  if (!signedMandate) {
    throw new Error("A signed AP2 mandate is required before hotel booking.");
  }

  const response = await fetch(`${getBackendBaseUrl()}/hotel-booking`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      trip_id: requireTripId(tripId),
      ap2_signed_mandate: signedMandate,
    }),
    signal,
  });

  if (!response.ok) {
    throw new Error(await formatApiError(response, "Hotel booking failed"));
  }

  return response.json() as Promise<HotelBookingResponse>;
}

function requireTripId(tripId: string) {
  const trimmed = tripId.trim();
  if (!trimmed) {
    throw new Error("A trip id is required for AP2 hotel booking.");
  }

  return trimmed;
}

function getBackendBaseUrl() {
  return (process.env.NEXT_PUBLIC_BACKEND_URL?.trim() || "http://localhost:8000").replace(
    /\/+$/,
    "",
  );
}

async function formatApiError(response: Response, fallback: string) {
  try {
    const body = (await response.json()) as {
      detail?: unknown;
      error?: BackendErrorPayload | null;
      message?: unknown;
    };
    if (typeof body.detail === "string" && body.detail.trim()) {
      return body.detail;
    }
    if (body.error?.message) {
      return body.error.message;
    }
    if (typeof body.message === "string" && body.message.trim()) {
      return body.message;
    }
  } catch {
    // Fall back to the status-based message below.
  }

  return `${fallback} with HTTP ${response.status}.`;
}
