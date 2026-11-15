"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  IconFocus2,
  IconPlus,
  IconPointer,
  IconPolygon,
  IconSquare,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import { standardButtonClass } from "@/lib/buttonStyles";
import { MAX_PROJECT_ZONES, PROJECT_ZONE_COLORS, type ProjectZone } from "@/lib/projects";
import type { ZoneDrawMode, ZoneMapController, ZoneRing } from "./ProjectZonesMap";

const ProjectZonesMap = dynamic(() => import("./ProjectZonesMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[480px] w-full items-center justify-center rounded-xl border border-slate-200 bg-slate-100 text-sm text-slate-500">
      Laster kart...
    </div>
  ),
});

type ProjectZonesEditorProps = {
  projectId: string;
  initialZones: ProjectZone[];
  canEdit: boolean;
  fallbackCenter: { lat: number; lng: number } | null;
};

const NEW_ID_PREFIX = "new-";

export default function ProjectZonesEditor({
  projectId,
  initialZones,
  canEdit,
  fallbackCenter,
}: ProjectZonesEditorProps) {
  const router = useRouter();
  const [zones, setZones] = useState<ProjectZone[]>(initialZones);
  const [savedZones, setSavedZones] = useState<ProjectZone[]>(initialZones);
  const [mode, setMode] = useState<ZoneDrawMode>("select");
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);
  const controllerRef = useRef<ZoneMapController | null>(null);

  const isDirty = useMemo(() => JSON.stringify(zones) !== JSON.stringify(savedZones), [zones, savedZones]);

  // Warn before leaving the page with unsaved zones.
  useEffect(() => {
    if (!isDirty) return;
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  useEffect(() => {
    if (!savedNotice) return;
    const timer = setTimeout(() => setSavedNotice(false), 2500);
    return () => clearTimeout(timer);
  }, [savedNotice]);

  function addZone(coordinates: ZoneRing) {
    setZones((prev) => {
      if (prev.length >= MAX_PROJECT_ZONES) return prev;
      const id = `${NEW_ID_PREFIX}${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
      const zone: ProjectZone = {
        id,
        name: nextZoneName(prev),
        color: PROJECT_ZONE_COLORS[prev.length % PROJECT_ZONE_COLORS.length],
        coordinates,
      };
      setSelectedZoneId(id);
      return [...prev, zone];
    });
  }

  function updateZone(zoneId: string, patch: Partial<ProjectZone>) {
    setZones((prev) => prev.map((zone) => (zone.id === zoneId ? { ...zone, ...patch } : zone)));
  }

  function updateVertex(zoneId: string, index: number, axis: "lat" | "lng", value: number) {
    setZones((prev) =>
      prev.map((zone) => {
        if (zone.id !== zoneId) return zone;
        const coordinates = zone.coordinates.map((point, pointIndex) => {
          if (pointIndex !== index) return point;
          return axis === "lng" ? ([value, point[1]] as [number, number]) : ([point[0], value] as [number, number]);
        });
        return { ...zone, coordinates };
      }),
    );
  }

  function addVertex(zoneId: string) {
    setZones((prev) =>
      prev.map((zone) => {
        if (zone.id !== zoneId) return zone;
        const last = zone.coordinates[zone.coordinates.length - 1];
        const first = zone.coordinates[0];
        const midpoint: [number, number] = [
          Math.round(((last[0] + first[0]) / 2) * 1e6) / 1e6,
          Math.round(((last[1] + first[1]) / 2) * 1e6) / 1e6,
        ];
        return { ...zone, coordinates: [...zone.coordinates, midpoint] };
      }),
    );
  }

  function removeVertex(zoneId: string, index: number) {
    setZones((prev) =>
      prev.map((zone) => {
        if (zone.id !== zoneId || zone.coordinates.length <= 3) return zone;
        return { ...zone, coordinates: zone.coordinates.filter((_, pointIndex) => pointIndex !== index) };
      }),
    );
  }

  function removeZone(zoneId: string) {
    setZones((prev) => prev.filter((zone) => zone.id !== zoneId));
    if (selectedZoneId === zoneId) setSelectedZoneId(null);
  }

  function discardChanges() {
    setZones(savedZones);
    setSelectedZoneId(null);
    setSaveError(null);
  }

  async function saveZones() {
    setSaving(true);
    setSaveError(null);
    try {
      const response = await fetch(`/api/prosjekter/${projectId}/soner`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          zones: zones.map((zone) => ({
            id: zone.id.startsWith(NEW_ID_PREFIX) ? undefined : zone.id,
            name: zone.name,
            color: zone.color,
            coordinates: zone.coordinates,
          })),
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { zones?: ProjectZone[]; error?: string };
      if (!response.ok || !payload.zones) {
        throw new Error(payload.error ?? "Kunne ikke lagre anleggssoner");
      }
      setZones(payload.zones);
      setSavedZones(payload.zones);
      setSelectedZoneId(null);
      setSavedNotice(true);
      router.refresh();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Kunne ikke lagre anleggssoner");
    } finally {
      setSaving(false);
    }
  }

  const invalidZone = zones.find((zone) => !zone.name.trim() || zone.coordinates.length < 3);

  return (
    <div className="space-y-5">
      {canEdit ? (
        <div className="flex flex-wrap items-center gap-2">
          <ToolButton
            active={mode === "select"}
            onClick={() => setMode("select")}
            icon={<IconPointer className="h-4 w-4" />}
            label="Velg og rediger"
          />
          <ToolButton
            active={mode === "polygon"}
            onClick={() => setMode("polygon")}
            icon={<IconPolygon className="h-4 w-4" />}
            label="Tegn sone"
            disabled={zones.length >= MAX_PROJECT_ZONES}
          />
          <ToolButton
            active={mode === "rectangle"}
            onClick={() => setMode("rectangle")}
            icon={<IconSquare className="h-4 w-4" />}
            label="Tegn rektangel"
            disabled={zones.length >= MAX_PROJECT_ZONES}
          />
          <span className="ml-auto text-xs text-slate-500">
            {mode === "polygon"
              ? "Klikk for å sette punkter. Klikk på første punkt eller dobbeltklikk for å avslutte."
              : mode === "rectangle"
                ? "Klikk for å sette første hjørne, deretter motsatt hjørne."
                : "Klikk på en sone i kartet for å flytte den eller dra i punktene."}
          </span>
        </div>
      ) : null}

      <ProjectZonesMap
        zones={zones}
        editable={canEdit}
        mode={mode}
        selectedZoneId={selectedZoneId}
        fallbackCenter={fallbackCenter}
        onZoneDrawn={addZone}
        onZoneEdited={(zoneId, coordinates) => updateZone(zoneId, { coordinates })}
        onZoneSelected={setSelectedZoneId}
        onModeChange={setMode}
        controllerRef={controllerRef}
      />

      <div className="flex items-center justify-between gap-4">
        <h3 className="text-base font-semibold text-slate-900">
          Anleggssoner
          <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
            {zones.length}
          </span>
        </h3>
        {zones.length > 1 ? (
          <button
            type="button"
            onClick={() => controllerRef.current?.fitAll()}
            className="cursor-pointer text-sm font-semibold text-blue-700 hover:text-blue-900"
          >
            Vis alle i kartet
          </button>
        ) : null}
      </div>

      {zones.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
          {canEdit
            ? "Ingen anleggssoner ennå. Bruk «Tegn sone» eller «Tegn rektangel» og tegn i kartet."
            : "Ingen anleggssoner er registrert for prosjektet."}
        </div>
      ) : (
        <div className="space-y-3">
          {zones.map((zone, index) => (
            <ZoneCard
              key={zone.id}
              zone={zone}
              index={index}
              selected={zone.id === selectedZoneId}
              canEdit={canEdit}
              onSelect={() => {
                setSelectedZoneId(zone.id);
                setMode("select");
              }}
              onFocus={() => controllerRef.current?.fitToZone(zone.id)}
              onRename={(name) => updateZone(zone.id, { name })}
              onRecolor={(color) => updateZone(zone.id, { color })}
              onVertexChange={(vertexIndex, axis, value) => updateVertex(zone.id, vertexIndex, axis, value)}
              onAddVertex={() => addVertex(zone.id)}
              onRemoveVertex={(vertexIndex) => removeVertex(zone.id, vertexIndex)}
              onRemove={() => removeZone(zone.id)}
            />
          ))}
        </div>
      )}

      {canEdit ? (
        <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
          <button
            type="button"
            onClick={() => void saveZones()}
            disabled={!isDirty || saving || Boolean(invalidZone)}
            className={standardButtonClass}
          >
            {saving ? "Lagrer..." : "Lagre soner"}
          </button>
          {isDirty ? (
            <button
              type="button"
              onClick={discardChanges}
              disabled={saving}
              className="cursor-pointer text-sm font-semibold text-slate-600 hover:text-slate-900"
            >
              Forkast endringer
            </button>
          ) : null}
          {invalidZone ? (
            <span className="text-sm text-amber-700">Alle soner må ha navn og minst tre punkter.</span>
          ) : isDirty ? (
            <span className="text-sm text-slate-500">Du har ulagrede endringer.</span>
          ) : savedNotice ? (
            <span className="text-sm text-emerald-700">Sonene er lagret.</span>
          ) : null}
          {saveError ? <span className="text-sm text-red-700">{saveError}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

function ToolButton({
  active,
  onClick,
  icon,
  label,
  disabled,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${
        active
          ? "border-blue-600 bg-blue-600 text-white hover:bg-blue-700"
          : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function ZoneCard({
  zone,
  index,
  selected,
  canEdit,
  onSelect,
  onFocus,
  onRename,
  onRecolor,
  onVertexChange,
  onAddVertex,
  onRemoveVertex,
  onRemove,
}: {
  zone: ProjectZone;
  index: number;
  selected: boolean;
  canEdit: boolean;
  onSelect: () => void;
  onFocus: () => void;
  onRename: (name: string) => void;
  onRecolor: (color: string) => void;
  onVertexChange: (vertexIndex: number, axis: "lat" | "lng", value: number) => void;
  onAddVertex: () => void;
  onRemoveVertex: (vertexIndex: number) => void;
  onRemove: () => void;
}) {
  const area = polygonAreaSquareMeters(zone.coordinates);

  return (
    <div
      className={`rounded-xl border bg-white transition ${
        selected ? "border-blue-400 ring-2 ring-blue-100" : "border-slate-200"
      }`}
    >
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3">
        <button
          type="button"
          onClick={onSelect}
          aria-label="Velg sone"
          className="h-5 w-5 shrink-0 cursor-pointer rounded-full ring-2 ring-white shadow"
          style={{ backgroundColor: zone.color }}
        />
        {canEdit ? (
          <input
            value={zone.name}
            onChange={(event) => onRename(event.target.value)}
            onFocus={onSelect}
            placeholder={`Sone ${index + 1}`}
            maxLength={80}
            className="h-9 min-w-0 flex-1 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          />
        ) : (
          <span className="flex-1 text-sm font-semibold text-slate-900">{zone.name}</span>
        )}
        <span className="text-xs text-slate-500 tabular-nums">
          {zone.coordinates.length} punkter · {formatArea(area)}
        </span>
        <button
          type="button"
          onClick={onFocus}
          className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
        >
          <IconFocus2 className="h-4 w-4" />
          Vis i kart
        </button>
        {canEdit ? (
          <button
            type="button"
            onClick={onRemove}
            aria-label="Slett sone"
            className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-red-700 shadow-sm hover:bg-red-50"
          >
            <IconTrash className="h-4 w-4" />
            Slett
          </button>
        ) : null}
      </div>

      {canEdit ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-2">
          <span className="text-xs text-slate-500">Farge</span>
          {PROJECT_ZONE_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => onRecolor(color)}
              aria-label={`Farge ${color}`}
              className={`h-5 w-5 cursor-pointer rounded-full transition ${
                zone.color === color ? "ring-2 ring-slate-900 ring-offset-1" : "hover:scale-110"
              }`}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2 w-12">#</th>
              <th className="px-3 py-2">Breddegrad (lat)</th>
              <th className="px-3 py-2">Lengdegrad (lng)</th>
              {canEdit ? <th className="px-3 py-2 w-12" /> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {zone.coordinates.map(([lng, lat], vertexIndex) => (
              <tr key={`${zone.id}-${vertexIndex}`}>
                <td className="px-4 py-1.5 text-slate-500 tabular-nums">{vertexIndex + 1}</td>
                <td className="px-3 py-1.5">
                  <CoordinateInput
                    value={lat}
                    min={-90}
                    max={90}
                    disabled={!canEdit}
                    onCommit={(value) => onVertexChange(vertexIndex, "lat", value)}
                  />
                </td>
                <td className="px-3 py-1.5">
                  <CoordinateInput
                    value={lng}
                    min={-180}
                    max={180}
                    disabled={!canEdit}
                    onCommit={(value) => onVertexChange(vertexIndex, "lng", value)}
                  />
                </td>
                {canEdit ? (
                  <td className="px-3 py-1.5 text-right">
                    <button
                      type="button"
                      onClick={() => onRemoveVertex(vertexIndex)}
                      disabled={zone.coordinates.length <= 3}
                      aria-label="Fjern punkt"
                      className="cursor-pointer rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <IconX className="h-4 w-4" />
                    </button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canEdit ? (
        <div className="px-4 py-2">
          <button
            type="button"
            onClick={onAddVertex}
            className="inline-flex cursor-pointer items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-900"
          >
            <IconPlus className="h-4 w-4" />
            Legg til punkt
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** Text input for one coordinate: local draft while typing, committed when the value parses. */
function CoordinateInput({
  value,
  min,
  max,
  disabled,
  onCommit,
}: {
  value: number;
  min: number;
  max: number;
  disabled: boolean;
  onCommit: (value: number) => void;
}) {
  const formatted = value.toFixed(6);
  const [draft, setDraft] = useState(formatted);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(formatted);
  }, [formatted, editing]);

  function commit(text: string) {
    const parsed = Number.parseFloat(text.replace(",", ".").trim());
    if (Number.isFinite(parsed) && parsed >= min && parsed <= max && Math.abs(parsed - value) > 1e-7) {
      onCommit(Math.round(parsed * 1e6) / 1e6);
    }
  }

  return (
    <input
      value={draft}
      disabled={disabled}
      inputMode="decimal"
      onFocus={() => setEditing(true)}
      onChange={(event) => {
        setDraft(event.target.value);
        commit(event.target.value);
      }}
      onBlur={() => {
        setEditing(false);
        setDraft(formatted);
      }}
      className="h-8 w-40 rounded-md border border-slate-300 px-2 text-sm tabular-nums text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:border-transparent disabled:bg-transparent disabled:px-0"
    />
  );
}

function nextZoneName(zones: ProjectZone[]) {
  const taken = new Set(zones.map((zone) => zone.name.trim().toLowerCase()));
  let counter = zones.length + 1;
  while (taken.has(`sone ${counter}`)) counter += 1;
  return `Sone ${counter}`;
}

/** Planar shoelace area on an equirectangular projection; accurate enough for site zones. */
function polygonAreaSquareMeters(ring: ZoneRing) {
  if (ring.length < 3) return 0;
  const earthRadius = 6371008.8;
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const meanLat = toRad(ring.reduce((sum, [, lat]) => sum + lat, 0) / ring.length);
  const points = ring.map(([lng, lat]) => [
    earthRadius * toRad(lng) * Math.cos(meanLat),
    earthRadius * toRad(lat),
  ]);
  let sum = 0;
  for (let index = 0; index < points.length; index += 1) {
    const [x1, y1] = points[index];
    const [x2, y2] = points[(index + 1) % points.length];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

function formatArea(squareMeters: number) {
  if (squareMeters >= 10_000) {
    return `${new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 1 }).format(squareMeters / 1000)} daa`;
  }
  return `${new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 0 }).format(squareMeters)} m²`;
}
