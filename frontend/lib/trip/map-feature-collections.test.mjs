import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function transpileFile(path) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  return ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
}

async function dataUrlFor(path) {
  return `data:text/javascript;base64,${Buffer.from(await transpileFile(path)).toString("base64")}`;
}

async function importMapFeatureModule() {
  const dayRouteUrl = await dataUrlFor("./day-route.ts");
  const geoUrl = await dataUrlFor("./geo.ts");
  const source = await transpileFile("./map-feature-collections.ts");
  const rewritten = source
    .replace(/from "@\/lib\/trip\/day-route"/g, `from "${dayRouteUrl}"`)
    .replace(/from "@\/lib\/trip\/geo"/g, `from "${geoUrl}"`)
    .replace(/import .*types.*;\n/g, "");
  const encoded = Buffer.from(rewritten).toString("base64");

  return import(`data:text/javascript;base64,${encoded}#${Date.now()}`);
}

const mapFeatures = await importMapFeatureModule();

const hotelBase = {
  selectedHotelId: "hotel-1",
  selectedHotelName: "Selected Hotel",
  selectedBaseId: "base-1",
  selectedBaseName: "Namba",
  hotelCandidates: [
    {
      id: "hotel-1",
      name: "Selected Hotel",
      lat: 34.67,
      lng: 135.5,
    },
  ],
  baseAreas: [
    {
      id: "base-1",
      name: "Namba",
      center: { lat: 34.66, lng: 135.49 },
    },
  ],
};

const places = [
  {
    id: "namba",
    name: "Namba",
    category: "market",
    day: 1,
    lat: 34.668,
    lng: 135.501,
  },
  {
    id: "invalid",
    name: "Invalid",
    category: "restaurant",
    day: 1,
    lat: 500,
    lng: 135,
  },
];

test("deriveHotelHub prefers selected hotel coordinates", () => {
  assert.deepEqual(mapFeatures.deriveHotelHub(hotelBase), {
    name: "Selected Hotel",
    lat: 34.67,
    lng: 135.5,
    kind: "hotel",
  });
});

test("buildPlaceFeatureCollection filters invalid coordinates and marks selection", () => {
  const collection = mapFeatures.buildPlaceFeatureCollection({
    places,
    selectedPlaceId: "namba",
  });

  assert.equal(collection.features.length, 1);
  assert.equal(collection.features[0].properties.placeId, "namba");
  assert.equal(collection.features[0].properties.glyph, "M");
  assert.equal(collection.features[0].properties.selected, true);
});

test("buildHotelHubFeatureCollection emits one hotel/base point", () => {
  const hub = mapFeatures.deriveHotelHub(hotelBase);
  const collection = mapFeatures.buildHotelHubFeatureCollection(hub);

  assert.equal(collection.features.length, 1);
  assert.equal(collection.features[0].properties.glyph, "H");
  assert.deepEqual(collection.features[0].geometry.coordinates, [135.5, 34.67]);
});

test("buildRouteFeatureCollection emits active route legs", () => {
  const days = [
    {
      day: 1,
      title: "Food day",
      summary: "Namba",
      placeIds: ["namba"],
      stops: [
        {
          timeOfDay: "morning",
          name: "Namba",
          category: "market",
          placeName: "Namba",
        },
      ],
    },
  ];

  const collection = mapFeatures.buildRouteFeatureCollection({
    days,
    places,
    selectedDay: "all",
    selectedRouteDay: 1,
    activeRouteLegId: null,
    hotelBase,
    directionsBySignature: {},
  });

  assert.equal(collection.features.length > 0, true);
  assert.equal(collection.features[0].properties.active, true);
});
