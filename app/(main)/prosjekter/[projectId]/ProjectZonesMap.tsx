"use client";

import { useEffect, useRef, type MutableRefObject } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  TerraDraw,
  TerraDrawPolygonMode,
  TerraDrawRectangleMode,
  TerraDrawSelectMode,
  type GeoJSONStoreFeatures,
  type HexColor,
} from "terra-draw";
import { TerraDrawMapLibreGLAdapter } from "terra-draw-maplibre-gl-adapter";
import { getMapStyleUrl, NORWAY_OVERVIEW } from "@/lib/map-style";
import type { ProjectZone } from "@/lib/projects";

export type ZoneDrawMode = "select" | "polygon" | "rectangle";
export type ZoneRing = Array<[number, number]>;

export type ZoneMapController = {
  fitToZone: (zoneId: string) => void;
  fitAll: () => void;
};

type ProjectZonesMapProps = {
  zones: ProjectZone[];
  editable: boolean;
  mode: ZoneDrawMode;
  selectedZoneId: string | null;
  fallbackCenter: { lat: number; lng: number } | null;
  onZoneDrawn: (coordinates: ZoneRing) => void;
  onZoneEdited: (zoneId: string, coordinates: ZoneRing) => void;
  onZoneSelected: (zoneId: string | null) => void;
  onModeChange: (mode: ZoneDrawMode) => void;
  controllerRef: MutableRefObject<ZoneMapController | null>;
};

const DEFAULT_COLOR: HexColor = "#2563EB";
const FIT_PADDING = 48;

export default function ProjectZonesMap({
  zones,
  editable,
  mode,
  selectedZoneId,
  fallbackCenter,
  onZoneDrawn,
  onZoneEdited,
  onZoneSelected,
  onModeChange,
  controllerRef,
}: ProjectZonesMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const drawRef = useRef<TerraDraw | null>(null);
  const readyRef = useRef(false);
  const zonesRef = useRef(zones);
  const callbacksRef = useRef({
    onZoneDrawn,
    onZoneEdited,
    onZoneSelected,
    onModeChange,
  });
  const syncRef = useRef<() => void>(() => {});

  zonesRef.current = zones;
  callbacksRef.current = {
    onZoneDrawn,
    onZoneEdited,
    onZoneSelected,
    onModeChange,
  };

  // ---- init map + draw (once) ----
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const initialZones = zonesRef.current;
    const bounds = boundsOfZones(initialZones);
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: getMapStyleUrl(),
      attributionControl: { compact: true },
      pitchWithRotate: false,
      dragRotate: false,
      ...(bounds
        ? { bounds, fitBoundsOptions: { padding: FIT_PADDING, maxZoom: 17 } }
        : fallbackCenter
          ? {
              center: [fallbackCenter.lng, fallbackCenter.lat] as [
                number,
                number,
              ],
              zoom: 13,
            }
          : { center: NORWAY_OVERVIEW.center, zoom: NORWAY_OVERVIEW.zoom }),
    });
    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "top-right",
    );
    mapRef.current = map;

    // Terra Draw adds its own layers, so the style must be loaded before it starts.
    const setupDraw = () => {
      const draw = new TerraDraw({
        adapter: new TerraDrawMapLibreGLAdapter({ map }),
        idStrategy: {
          isValidId: (id) => typeof id === "string" && id.length > 0,
          getId: () => randomId(),
        },
        modes: [
          new TerraDrawPolygonMode({
            styles: {
              fillColor: colorOf,
              fillOpacity: 0.25,
              outlineColor: colorOf,
              outlineWidth: 2,
              closingPointColor: colorOf,
            },
          }),
          new TerraDrawRectangleMode({
            styles: {
              fillColor: colorOf,
              fillOpacity: 0.25,
              outlineColor: colorOf,
              outlineWidth: 2,
            },
          }),
          new TerraDrawSelectMode({
            flags: {
              polygon: {
                feature: {
                  draggable: true,
                  coordinates: {
                    midpoints: true,
                    draggable: true,
                    deletable: true,
                  },
                },
              },
            },
          }),
        ],
      });
      drawRef.current = draw;

      draw.on("ready", () => {
        readyRef.current = true;
        syncRef.current();
        draw.setMode(editable ? "select" : "static");
      });

      draw.on("finish", (id, context) => {
        const feature = draw.getSnapshotFeature(id);
        if (!feature || feature.geometry.type !== "Polygon") return;
        const ring = openRing(feature.geometry.coordinates[0] as ZoneRing);

        if (context.action === "draw") {
          // The drawn feature is replaced by the zone that React state adds back.
          setTimeout(() => {
            try {
              draw.removeFeatures([id]);
            } catch {
              // Feature may already be gone.
            }
            callbacksRef.current.onZoneDrawn(ring);
            callbacksRef.current.onModeChange("select");
          }, 0);
          return;
        }

        callbacksRef.current.onZoneEdited(String(id), ring);
      });

      draw.on("change", (ids, type) => {
        if (type !== "update") return;
        if (draw.getModeState() === "drawing") return;
        for (const id of ids) {
          const feature = draw.getSnapshotFeature(id);
          if (!feature || feature.geometry.type !== "Polygon") continue;
          const zone = zonesRef.current.find(
            (entry) => entry.id === String(id),
          );
          if (!zone) continue;
          const ring = openRing(feature.geometry.coordinates[0] as ZoneRing);
          if (!ringsEqual(ring, zone.coordinates)) {
            callbacksRef.current.onZoneEdited(zone.id, ring);
          }
        }
      });

      draw.on("select", (id) =>
        callbacksRef.current.onZoneSelected(String(id)),
      );
      draw.on("deselect", () => callbacksRef.current.onZoneSelected(null));

      draw.start();
    };

    if (map.isStyleLoaded()) {
      setupDraw();
    } else {
      map.once("load", setupDraw);
    }

    controllerRef.current = {
      fitToZone: (zoneId) => {
        const zone = zonesRef.current.find((entry) => entry.id === zoneId);
        const zoneBounds = zone ? boundsOfZones([zone]) : null;
        if (zoneBounds)
          map.fitBounds(zoneBounds, {
            padding: FIT_PADDING,
            maxZoom: 18,
            duration: 500,
          });
      },
      fitAll: () => {
        const allBounds = boundsOfZones(zonesRef.current);
        if (allBounds)
          map.fitBounds(allBounds, {
            padding: FIT_PADDING,
            maxZoom: 17,
            duration: 500,
          });
      },
    };

    return () => {
      controllerRef.current = null;
      readyRef.current = false;
      map.off("load", setupDraw);
      try {
        drawRef.current?.stop();
      } catch {
        // ignore
      }
      drawRef.current = null;
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- keep Terra Draw features in sync with React state ----
  useEffect(() => {
    syncRef.current = () => {
      const draw = drawRef.current;
      if (!draw || !readyRef.current) return;
      if (draw.getModeState() === "drawing") return;

      const existing = new Map<string, GeoJSONStoreFeatures>();
      for (const feature of draw.getSnapshot()) {
        if (feature.geometry.type === "Polygon")
          existing.set(String(feature.id), feature);
      }

      for (const zone of zones) {
        const desired = closeRing(zone.coordinates);
        const current = existing.get(zone.id);
        existing.delete(zone.id);
        if (
          current &&
          current.geometry.type === "Polygon" &&
          ringsEqual(
            openRing(current.geometry.coordinates[0] as ZoneRing),
            zone.coordinates,
          ) &&
          current.properties.color === zone.color
        ) {
          continue;
        }
        if (current) safeRemove(draw, zone.id);
        if (zone.coordinates.length >= 3) {
          draw.addFeatures([
            {
              type: "Feature",
              id: zone.id,
              geometry: { type: "Polygon", coordinates: [desired] },
              properties: { mode: "polygon", color: zone.color },
            },
          ]);
        }
      }

      for (const staleId of existing.keys()) safeRemove(draw, staleId);
    };
    syncRef.current();
  }, [zones]);

  // ---- mode ----
  useEffect(() => {
    const draw = drawRef.current;
    if (!draw || !readyRef.current) return;
    try {
      draw.setMode(editable ? mode : "static");
    } catch {
      // mode may not be ready yet; the ready handler sets it
    }
  }, [mode, editable]);

  // ---- selection from the list ----
  useEffect(() => {
    const draw = drawRef.current;
    if (!draw || !readyRef.current || !editable || mode !== "select") return;
    try {
      if (selectedZoneId && zones.some((zone) => zone.id === selectedZoneId)) {
        draw.selectFeature(selectedZoneId);
      }
    } catch {
      // ignore selection races
    }
  }, [selectedZoneId, editable, mode, zones]);

  return (
    <div
      ref={containerRef}
      className="h-[480px] w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100"
    />
  );
}

// ---- helpers ----

function colorOf(feature: GeoJSONStoreFeatures): HexColor {
  const color = feature.properties?.color;
  return typeof color === "string" && /^#[0-9a-fA-F]{6}$/.test(color)
    ? (color as HexColor)
    : DEFAULT_COLOR;
}

function safeRemove(draw: TerraDraw, id: string) {
  try {
    draw.deselectFeature(id);
  } catch {
    // not selected
  }
  try {
    draw.removeFeatures([id]);
  } catch {
    // already gone
  }
}

function roundCoord(value: number) {
  return Math.round(value * 1e6) / 1e6;
}

export function openRing(ring: ZoneRing): ZoneRing {
  const points = ring.map(
    ([lng, lat]) => [roundCoord(lng), roundCoord(lat)] as [number, number],
  );
  if (points.length >= 2) {
    const [first, last] = [points[0], points[points.length - 1]];
    if (first[0] === last[0] && first[1] === last[1]) points.pop();
  }
  return points;
}

function closeRing(ring: ZoneRing): ZoneRing {
  if (!ring.length) return ring;
  return [...ring, ring[0]];
}

function ringsEqual(a: ZoneRing, b: ZoneRing) {
  if (a.length !== b.length) return false;
  return a.every(
    (point, index) =>
      roundCoord(point[0]) === roundCoord(b[index][0]) &&
      roundCoord(point[1]) === roundCoord(b[index][1]),
  );
}

function boundsOfZones(
  zones: ProjectZone[],
): [[number, number], [number, number]] | null {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  for (const zone of zones) {
    for (const [lng, lat] of zone.coordinates) {
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
      minLng = Math.min(minLng, lng);
      minLat = Math.min(minLat, lat);
      maxLng = Math.max(maxLng, lng);
      maxLat = Math.max(maxLat, lat);
    }
  }
  if (!Number.isFinite(minLng) || !Number.isFinite(minLat)) return null;
  // Give a single point or a tiny zone some room.
  const padLng = maxLng - minLng < 0.0005 ? 0.0005 : 0;
  const padLat = maxLat - minLat < 0.0005 ? 0.0005 : 0;
  return [
    [minLng - padLng, minLat - padLat],
    [maxLng + padLng, maxLat + padLat],
  ];
}

function randomId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function")
    return crypto.randomUUID();
  return `tmp-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}
