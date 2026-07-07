import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function importHotelBookingModule() {
  let ts;
  try {
    ts = await import("typescript");
  } catch {
    return import(`${new URL("./hotel-booking.ts", import.meta.url).href}?${Date.now()}`);
  }

  const source = await readFile(new URL("./hotel-booking.ts", import.meta.url), "utf8");
  const typescript = ts.default ?? ts;
  const transpiled = typescript.transpileModule(source, {
    compilerOptions: {
      module: typescript.ModuleKind.ES2022,
      target: typescript.ScriptTarget.ES2022,
    },
  }).outputText;
  const encoded = Buffer.from(transpiled).toString("base64");

  return import(`data:text/javascript;base64,${encoded}#${Date.now()}`);
}

const originalFetch = globalThis.fetch;
const originalBackendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalBackendUrl === undefined) {
    delete process.env.NEXT_PUBLIC_BACKEND_URL;
  } else {
    process.env.NEXT_PUBLIC_BACKEND_URL = originalBackendUrl;
  }
});

const signedMandate = {
  format: "astrail-ap2-demo-jws",
  protected: "protected-header",
  payload: "signed-payload",
  signature: "signature",
  payload_json: {
    mandate_id: "ap2-demo-astrail-demo-osaka-001",
  },
};

test("requestHotelBookingMandate posts the canonical demo AP2 confirmation payload", async () => {
  process.env.NEXT_PUBLIC_BACKEND_URL = "http://localhost:8001/";
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return {
      ok: true,
      json: async () => ({
        status: "signed",
        ap2: {
          status: "created",
          signed_mandate: signedMandate,
        },
        preview: null,
        error: null,
      }),
    };
  };

  const hotelBooking = await importHotelBookingModule();
  const result = await hotelBooking.requestHotelBookingMandate({
    tripId: "astrail-demo-osaka-001",
  });

  assert.equal(result.status, "signed");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://localhost:8001/ap2/hotel-booking-mandate");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers["Content-Type"], "application/json");
  assert.equal(calls[0].init.headers.Accept, "application/json");
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    trip_id: "astrail-demo-osaka-001",
    user_confirmation: {
      confirmed: true,
      button_label: "Confirm Hotel Booking",
      trusted_surface: "astrail-web",
    },
  });
});

test("submitHotelBooking sends the signed mandate without frontend hotel-base metadata", async () => {
  process.env.NEXT_PUBLIC_BACKEND_URL = "http://backend.test";
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return {
      ok: true,
      json: async () => ({
        status: "mock_confirmed",
        payment: { status: "simulated" },
        receipt: { booking_id: "ASTRAIL-MOCK-HOTEL-123" },
        error: null,
      }),
    };
  };

  const hotelBooking = await importHotelBookingModule();
  const result = await hotelBooking.submitHotelBooking({
    tripId: "astrail-demo-osaka-001",
    signedMandate,
  });

  assert.equal(result.status, "mock_confirmed");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://backend.test/hotel-booking");
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    trip_id: "astrail-demo-osaka-001",
    ap2_signed_mandate: signedMandate,
  });
});

test("submitHotelBooking returns rejected backend responses for the UI to show", async () => {
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      status: "rejected",
      payment: null,
      receipt: null,
      ap2: null,
      error: {
        code: "ap2_mandate_required",
        message: "A signed AP2 mandate is required when AP2_MODE=demo_signed.",
      },
    }),
  });

  const hotelBooking = await importHotelBookingModule();
  const result = await hotelBooking.submitHotelBooking({
    tripId: "astrail-demo-osaka-001",
    signedMandate,
  });

  assert.equal(result.status, "rejected");
  assert.equal(result.error.code, "ap2_mandate_required");
  assert.equal(result.receipt, null);
});

test("requestHotelBookingMandate rejects a signed response without a signed mandate", async () => {
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      status: "signed",
      ap2: {
        status: "created",
        signed_mandate: null,
      },
      error: null,
    }),
  });

  const hotelBooking = await importHotelBookingModule();

  await assert.rejects(
    () => hotelBooking.requestHotelBookingMandate({ tripId: "astrail-demo-osaka-001" }),
    /signed AP2 mandate/,
  );
});
