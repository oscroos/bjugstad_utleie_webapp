// lib/map-style.ts
// Shared MapLibre style URL for every map in the app (machines map, project zones).

const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY;

export function getMapStyleUrl() {
  return MAPTILER_KEY
    ? `https://api.maptiler.com/maps/streets-v2/style.json?key=${MAPTILER_KEY}`
    : "https://demotiles.maplibre.org/style.json";
}

// Norway overview used when a map has nothing better to centre on.
export const NORWAY_OVERVIEW = { center: [13.0, 64.5] as [number, number], zoom: 4 };
