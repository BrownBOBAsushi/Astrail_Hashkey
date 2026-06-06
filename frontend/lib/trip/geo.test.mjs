import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function importGeoModule() {
  const source = await readFile(new URL("./geo.ts", import.meta.url), "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const encoded = Buffer.from(transpiled).toString("base64");

  return import(`data:text/javascript;base64,${encoded}`);
}

const geo = await importGeoModule();

test("coerceSafeMapCenter falls back for NaN coordinates", () => {
  assert.deepEqual(
    geo.coerceSafeMapCenter({ lng: Number.NaN, lat: Number.NaN }),
    geo.DEFAULT_MAP_CENTER,
  );
});

test("coerceSafeMapCenter preserves valid coordinates", () => {
  assert.deepEqual(geo.coerceSafeMapCenter({ lng: 135.502, lat: 34.668 }), {
    lng: 135.502,
    lat: 34.668,
  });
});

test("isValidLngLatValue rejects non-finite values", () => {
  assert.equal(geo.isValidLngLatValue(Number.NaN, 34.668), false);
  assert.equal(geo.isValidLngLatValue(135.502, Number.POSITIVE_INFINITY), false);
});
