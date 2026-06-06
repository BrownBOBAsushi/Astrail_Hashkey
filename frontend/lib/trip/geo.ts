export type LngLatValue = {
  lng: number;
  lat: number;
};

export const DEFAULT_MAP_CENTER = {
  lng: 103.8198,
  lat: 1.3521,
} satisfies LngLatValue;

export function isValidLngLatValue(lng: unknown, lat: unknown): boolean {
  return (
    typeof lng === "number" &&
    typeof lat === "number" &&
    Number.isFinite(lng) &&
    Number.isFinite(lat) &&
    lng >= -180 &&
    lng <= 180 &&
    lat >= -90 &&
    lat <= 90
  );
}

export function coerceSafeMapCenter(
  center: { lng: unknown; lat: unknown },
  fallback: LngLatValue = DEFAULT_MAP_CENTER,
): LngLatValue {
  return isValidLngLatValue(center.lng, center.lat)
    ? {
        lng: center.lng as number,
        lat: center.lat as number,
      }
    : fallback;
}
