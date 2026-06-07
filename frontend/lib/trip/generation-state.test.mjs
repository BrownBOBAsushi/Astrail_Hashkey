import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function importGenerationStateModule() {
  const source = await readFile(new URL("./generation-state.ts", import.meta.url), "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText
    .replace(/import .*TripMap.*;\n/g, "")
    .replace(/import .*UserPreferencesPayload.*;\n/g, "")
    .replace(/import .*TripExperience.*;\n/g, "")
    .replace(
      /import \{ formatPriorityTheme \} from "@\/lib\/trip\/agent-copy";/,
      "const formatPriorityTheme = (theme) => theme.replace(/_/g, ' ');",
    );
  const encoded = Buffer.from(transpiled).toString("base64");

  return import(`data:text/javascript;base64,${encoded}#${Date.now()}`);
}

const generationState = await importGenerationStateModule();

test("parseReelUrls trims, splits, and dedupes reel input", () => {
  assert.deepEqual(
    generationState.parseReelUrls(" https://a.example/reel/1,\nhttps://b.example/reel/2 https://a.example/reel/1 "),
    ["https://a.example/reel/1", "https://b.example/reel/2"],
  );
});

test("getMapMode keeps globe until extracted places ground the map", () => {
  assert.equal(generationState.getMapMode("idle_globe", null), "globe");
  assert.equal(generationState.getMapMode("extracting_places", { id: "trip" }), "globe");
  assert.equal(generationState.getMapMode("zooming_to_destination", { id: "trip" }), "extracting");
  assert.equal(generationState.getMapMode("trip_ready", { id: "trip" }), "trip");
});

test("buildSteeringSignal describes locked places and priority themes", () => {
  const signal = generationState.buildSteeringSignal(
    {
      lockedHotelBase: true,
      lockedPlaceIds: new Set(["namba"]),
      priorityThemes: ["route_efficiency"],
      regenerateDay: 2,
      steeringNotes: ["avoid late checkout"],
    },
    {
      places: [
        { id: "namba", name: "Namba" },
        { id: "umeda", name: "Umeda" },
      ],
    },
  );

  assert.match(signal, /Keep the current hotel base/);
  assert.match(signal, /Namba/);
  assert.match(signal, /route efficiency/);
  assert.match(signal, /Day 2/);
});

test("stream event readers reject wrong primitive shapes", () => {
  assert.deepEqual(generationState.readStreamEventRecord({ type: "stage" }), { type: "stage" });
  assert.equal(generationState.readStreamEventRecord(["stage"]), null);
  assert.equal(generationState.readStreamEventString(" done "), "done");
  assert.equal(generationState.readStreamEventString(1), "");
  assert.equal(generationState.readStreamEventNumber(12.5), 12.5);
  assert.equal(generationState.readStreamEventNumber(Number.NaN), null);
});
