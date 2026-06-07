import type { Map, MapEventOf } from "mapbox-gl";

export function registerMapRuntimeGuards(map: Map) {
  const handleMapError = (event: MapEventOf<"error">) => {
    const message = redactMapboxAccessToken(getUnknownErrorMessage(event.error));

    if (isExpectedMapboxRuntimeNoise(message)) {
      return;
    }

    console.warn("[TripCanvas map]", message || "Mapbox emitted an error event.");
  };

  const handleWebGlContextLost = (event: MapEventOf<"webglcontextlost">) => {
    event.originalEvent?.preventDefault();
  };

  const handleCanvasRuntimeEvent = (event: Event) => {
    if (event.type === "webglcontextlost") {
      event.preventDefault();
    }

    event.stopPropagation();
  };

  const canvas = map.getCanvas();
  map.on("error", handleMapError);
  map.on("webglcontextlost", handleWebGlContextLost);
  canvas.addEventListener("error", handleCanvasRuntimeEvent, true);
  canvas.addEventListener("webglcontextlost", handleCanvasRuntimeEvent, false);

  return () => {
    map.off("error", handleMapError);
    map.off("webglcontextlost", handleWebGlContextLost);
    canvas.removeEventListener("error", handleCanvasRuntimeEvent, true);
    canvas.removeEventListener("webglcontextlost", handleCanvasRuntimeEvent, false);
  };
}

export function getUnknownErrorMessage(value: unknown) {
  if (!value) {
    return "";
  }

  if (value instanceof Error) {
    return value.message;
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof Event !== "undefined" && value instanceof Event) {
    return `${value.type || "unknown"} event`;
  }

  if (typeof value === "object" && "message" in value) {
    const message = (value as { message?: unknown }).message;
    if (typeof message === "string") {
      return message;
    }
  }

  return String(value);
}

export function redactMapboxAccessToken(message: string) {
  return message.replace(/access_token=[^&\s)]+/g, "access_token=[redacted]");
}

export function isExpectedMapboxRuntimeNoise(message: string) {
  return [
    "e.json.meshes is not iterable",
    "Failed to evaluate expression",
    "Cutoff is currently disabled on terrain",
  ].some((pattern) => message.includes(pattern));
}
