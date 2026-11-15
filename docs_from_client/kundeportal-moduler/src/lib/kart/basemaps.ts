// ────────────────────────────────────────────────────────────────────────────
//  BAKGRUNNSKART (del 9): brukes av både flåtekartet og anleggskartet.
//  KART      – vektorkart (Mapbox/MapLibre eller Kartverkets topo)
//  FLYFOTO   – Norge i bilder (Kartverket/Geovekst ortofoto, WMTS). Skarpest;
//              oppdateres områdevis hvert 1–4 år. Krav: vis attribusjon.
//  SATELLITE – satellittbilder (ESRI World Imagery / Sentinel-2). Ferskere
//              dekning, lavere oppløsning enn ortofoto.
//  SCHEMATIC – skjematisk oversikt (kun flåtekartet).
// ────────────────────────────────────────────────────────────────────────────
export type Basemap = "SCHEMATIC" | "MAP" | "AERIAL" | "SATELLITE";

export const BASEMAP_TILES: Record<Exclude<Basemap, "SCHEMATIC">, { url: string; attribution: string; maxZoom: number }> = {
  MAP: {
    url: "https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/{z}/{y}/{x}.png",
    attribution: "© Kartverket",
    maxZoom: 18,
  },
  AERIAL: {
    // Norge i bilder – krever avtale/bruksvilkår fra Kartverket/Geovekst for
    // kommersiell bruk; integrator verifiserer endepunkt og vilkår.
    url: "https://opencache.statkart.no/gatekeeper/gk/gk.open_nib_web_mercator_wmts_v2?...",
    attribution: "© Kartverket, Geovekst og kommunene (Norge i bilder)",
    maxZoom: 20,
  },
  SATELLITE: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "© Esri, Maxar, Earthstar Geographics",
    maxZoom: 19,
  },
};
// UI: lagvelger [Skjematisk | Kart | Flyfoto | Satellitt] på flåtekartet,
// [Kart | Flyfoto | Satellitt] på anleggskartet. Soner/markører tegnes som
// vektoroverlegg uavhengig av bakgrunn.
