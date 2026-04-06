// app/(main)/kart/Map.tsx
"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { FeatureCollection, Geometry, Point } from "geojson";
import maplibregl, { Map, GeoJSONSource } from "maplibre-gl";
import type { GeoJSONSourceSpecification, LayerSpecification, StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
    IconSun,
    IconMoon,
    IconFlag,
    IconFlagOff,
    IconRoad,
    IconRoadOff,
    IconWriting,
    IconWritingOff,
} from "@tabler/icons-react";
import { useSession } from "next-auth/react";
import DataTable, { type DataColumn } from "@/components/DataTable";
import DialogFlowHost, { type DialogAgreementInput } from "@/components/dialogs/DialogFlowHost";
import { useMachines, useMachinesList } from "@/components/MachinesContext";
import type {
    MachineFeature,
    MachineListEntry,
    MachinesFC,
    MachinePositionHistoryEntry,
    MachineProps,
} from "@/types/machines";
import Image from "next/image";
import { standardButtonCompactClass } from "@/lib/buttonStyles";
import { getOEMLogo } from "@/lib/get_OEM_logo";
import { getOemColor, getOemColorMatchEntries, OEM_COLORS } from "@/lib/oem-colors";

type Props = { features?: MachinesFC };
type HistoryFeatureCollection = FeatureCollection<
    Geometry,
    { kind: "point" | "line"; reported_at?: string; history_id?: string; selected?: boolean; is_current?: boolean }
>;

const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY;
const SHOW_HISTORY_LABEL = "Se siste bevegelser";
const HISTORY_OVERLAY_EDGE_PX = 16;
const HISTORY_OVERLAY_MIN_VISIBLE_OBSERVATIONS = 2;
const HISTORY_OVERLAY_OBSERVATION_ROW_FALLBACK_PX = 56;
const HISTORY_OVERLAY_OBSERVATIONS_TITLE_FALLBACK_PX = 24;
const HISTORY_OVERLAY_COMPACT_SCROLL_BUFFER_PX = 12;
const HISTORY_INTERVAL_OPTIONS = [
    { label: "Alle", valueMs: 0 },
    { label: "15 min", valueMs: 15 * 60 * 1000 },
    { label: "1 t", valueMs: 60 * 60 * 1000 },
    { label: "3 t", valueMs: 3 * 60 * 60 * 1000 },
    { label: "6 t", valueMs: 6 * 60 * 60 * 1000 },
    { label: "12 t", valueMs: 12 * 60 * 60 * 1000 },
    { label: "24 t", valueMs: 24 * 60 * 60 * 1000 },
    { label: "3 d", valueMs: 3 * 24 * 60 * 60 * 1000 },
] as const;
const DEFAULT_HISTORY_INTERVAL_MS = 15 * 60 * 1000;

// Palette
const c = {
    blue: "#3B82F6",
    blueDark: "#1D4ED8",
    grayStroke: "#F8FAFC",
    cluster1: "#D9E2EC",
    cluster2: "#9FB3C8",
    cluster3: "#486581",
};

function buildOemColorExpression(): any[] {
    return [
        "match",
        ["downcase", ["coalesce", ["to-string", ["get", "oem_name"]], ""]],
        ...getOemColorMatchEntries(),
        OEM_COLORS.default,
    ];
}

const OEM_COLOR_EXPRESSION = buildOemColorExpression() as unknown as maplibregl.ExpressionSpecification;

export default function MapView({ features }: Props) {
    const mapViewportRef = useRef<HTMLDivElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const bottomPanelRef = useRef<HTMLDivElement | null>(null);
    const historyOverlayRef = useRef<HTMLDivElement | null>(null);
    const historyOverlayCardRef = useRef<HTMLDivElement | null>(null);
    const historyOverlayHeaderRef = useRef<HTMLDivElement | null>(null);
    const historyOverlayFiltersRef = useRef<HTMLDivElement | null>(null);
    const historyObservationsTitleRef = useRef<HTMLDivElement | null>(null);
    const resizeOverlayRef = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<Map | null>(null);
    const loadedRef = useRef(false);
    const appliedThemeRef = useRef<"light" | "dark">("light");
    const themeRef = useRef<"light" | "dark">("light");
    const styleCacheRef = useRef<{ light?: StyleSpecification; dark?: StyleSpecification }>({});
    const { data: session } = useSession();
    const openMachineDialogRef = useRef<((machineId: number, machineLabel: string) => void) | null>(null);
    const openAgreementDialogRef = useRef<((agreement: DialogAgreementInput) => void) | null>(null);

    // UI theme
    const [theme, setTheme] = useState<"light" | "dark">("light");

    // Basemap visibility toggles
    const [labelsVisible, setLabelsVisible] = useState(true);
    const [roadsVisible, setRoadsVisible] = useState(true);
    const [bordersVisible, setBordersVisible] = useState(true);
    const [selectedId, setSelectedId] = useState<string | number | null>(null);
    const [historyEntries, setHistoryEntries] = useState<MachinePositionHistoryEntry[]>([]);
    const [historyMachineName, setHistoryMachineName] = useState<string | null>(null);
    const [historyColor, setHistoryColor] = useState<string>(OEM_COLORS.default);
    const [historyOverlayOpen, setHistoryOverlayOpen] = useState(false);
    const [historyOverlayUsesFullCardScroll, setHistoryOverlayUsesFullCardScroll] = useState(false);
    const [selectedHistoryEntryId, setSelectedHistoryEntryId] = useState<string | null>(null);
    const [historyRangeStartIndex, setHistoryRangeStartIndex] = useState(0);
    const [historyRangeEndIndex, setHistoryRangeEndIndex] = useState(0);
    const [historyObservationGapMs, setHistoryObservationGapMs] = useState<number>(DEFAULT_HISTORY_INTERVAL_MS);
    const historyDataRef = useRef<HistoryFeatureCollection>(emptyHistoryFeatureCollection());
    const historyMachineIdRef = useRef<string | null>(null);
    const historyColorRef = useRef<string>(OEM_COLORS.default);
    const historyRowRefs = useRef<Record<string, HTMLButtonElement | null>>({});
    const historyLoadingRef = useRef(false);

    const labelLayerIds = useRef<string[]>([]);
    const roadLayerIds = useRef<string[]>([]);
    const borderLayerIds = useRef<string[]>([]);
    const labelsVisibleRef = useRef(labelsVisible);
    const roadsVisibleRef = useRef(roadsVisible);
    const bordersVisibleRef = useRef(bordersVisible);

    // ----- read data: prefer prop, else context -----
    const ctx = useMachines();
    const machineList = useMachinesList();
    const data: MachinesFC = features ?? ctx;
    const [visibleMachineIds, setVisibleMachineIds] = useState<string[] | null>(null);

    // Validate incoming features
    const safeFeatures = useMemo(() => {
        const fs = (data?.features ?? []).filter((f): f is MachineFeature => {
            const g = f.geometry as Point;
            return (
                g?.type === "Point" &&
                Array.isArray(g.coordinates) &&
                g.coordinates.length === 2 &&
                Number.isFinite(g.coordinates[0]) &&
                Number.isFinite(g.coordinates[1])
            );
        });
        return { type: "FeatureCollection", features: fs } as MachinesFC;
    }, [data]);

    const visibleFeatures = useMemo(() => {
        if (visibleMachineIds === null) return safeFeatures;
        const idSet = new Set(visibleMachineIds.map(String));
        return {
            type: "FeatureCollection",
            features: safeFeatures.features.filter((feature) =>
                idSet.has(String(feature.properties?.id)),
            ),
        } as MachinesFC;
    }, [safeFeatures, visibleMachineIds]);

    const handleVisibleRowsChange = useCallback((rows: MachineListEntry[]) => {
        const nextIds = rows.map((machine) => String(machine.id ?? ""));
        setVisibleMachineIds((prev) => {
            if (
                prev !== null &&
                prev.length === nextIds.length &&
                prev.every((id, index) => id === nextIds[index])
            ) {
                return prev;
            }
            return nextIds;
        });
    }, []);

    const maxHistoryIndex = historyEntries.length > 0 ? historyEntries.length - 1 : 0;
    const safeHistoryRangeStartIndex = historyEntries.length
        ? clamp(historyRangeStartIndex, 0, maxHistoryIndex)
        : 0;
    const safeHistoryRangeEndIndex = historyEntries.length
        ? clamp(historyRangeEndIndex, safeHistoryRangeStartIndex, maxHistoryIndex)
        : 0;

    const historyRangeStartEntry = historyEntries[safeHistoryRangeStartIndex] ?? null;
    const historyRangeEndEntry = historyEntries[safeHistoryRangeEndIndex] ?? null;

    const rangedHistoryEntries = useMemo(() => {
        if (!historyEntries.length) return [];
        return historyEntries.slice(safeHistoryRangeStartIndex, safeHistoryRangeEndIndex + 1);
    }, [historyEntries, safeHistoryRangeStartIndex, safeHistoryRangeEndIndex]);

    const filteredHistoryEntries = useMemo(
        () => filterHistoryEntriesByMinimumGap(rangedHistoryEntries, historyObservationGapMs),
        [rangedHistoryEntries, historyObservationGapMs],
    );

    const historyEntriesDesc = useMemo(
        () => [...filteredHistoryEntries].reverse(),
        [filteredHistoryEntries],
    );

    const currentHistoryEntryId = useMemo(
        () => getLatestHistoryEntryId(filteredHistoryEntries),
        [filteredHistoryEntries],
    );

    const columns: DataColumn<MachineListEntry>[] = [
        {
            id: "oem",
            header: "OEM",
            accessor: (machine) => machine.oem_name ?? "N/A",
            cell: (machine) => {
                const oemName = machine.oem_name ?? "N/A";
                return (
                    <div className="flex h-10 w-14 items-center justify-center">
                        <Image
                            src={getOemFilterKey(oemName)}
                            alt={`${oemName} logo`}
                            width={56}
                            height={40}
                            className="max-h-full max-w-full object-contain"
                            priority={false}
                        />
                    </div>
                );
            },
            sortValue: (machine) => (machine.oem_name ?? "").toLowerCase(),
            filterValue: (machine) => getOemFilterKey(machine.oem_name ?? "N/A"),
            filterOptionSortValue: (value) => formatOemFilterLabel(value),
            filterOptionLabel: (value) => (
                <span className="inline-flex items-center gap-2">
                    <span className="inline-flex h-7 w-10 items-center justify-center rounded bg-white">
                        <Image
                            src={value}
                            alt="OEM logo"
                            width={40}
                            height={28}
                            className="max-h-full max-w-full object-contain"
                        />
                    </span>
                    <span className="truncate">{formatOemFilterLabel(value)}</span>
                </span>
            ),
            headerClassName: "w-16",
            cellClassName: "w-16 align-middle",
        },
        {
            id: "id",
            header: "ID",
            accessor: (machine) => machine.id ?? "-",
            cell: (machine) => <span className="text-slate-700">{String(machine.id ?? "-")}</span>,
            sortValue: (machine) => String(machine.id ?? ""),
            filterValue: (machine) => String(machine.id ?? "-"),
            cellClassName: "whitespace-nowrap align-middle",
        },
        {
            id: "name",
            header: "Navn",
            accessor: (machine) => machine.name ?? "",
            cell: (machine) => <span className="text-slate-900">{machine.name ?? "-"}</span>,
            sortValue: (machine) => (machine.name ?? "").toLowerCase(),
            filterValue: (machine) => machine.name ?? "-",
            cellClassName: "align-middle",
        },
        {
            id: "category",
            header: "Kategori",
            accessor: (machine) => machine.category ?? "",
            cell: (machine) =>
                machine.category ? (
                    <span className="text-slate-700">{machine.category}</span>
                ) : (
                    <span className="text-slate-400">-</span>
                ),
            sortValue: (machine) => (machine.category ?? "").toLowerCase(),
            filterValue: (machine) => machine.category ?? "-",
            cellClassName: "align-middle",
        },
        {
            id: "activeAgreement",
            header: "Aktiv avtale",
            accessor: (machine) => machine.active_agreement_id ?? "",
            cell: (machine) => {
                const agreement = getAgreementDialogInput(machine);
                if (!agreement) {
                    return <span className="text-slate-400">-</span>;
                }
                return (
                    <button
                        type="button"
                        onClick={(event) => {
                            event.stopPropagation();
                            openAgreementDialogRef.current?.(agreement);
                        }}
                        className="inline-flex max-w-full cursor-pointer items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-800 transition hover:border-blue-300 hover:bg-blue-100"
                    >
                        <span className="truncate font-semibold">{agreement.id}</span>
                    </button>
                );
            },
            sortValue: (machine) => machine.active_agreement_id ?? "",
            filterValue: (machine) => machine.active_agreement_id ?? "-",
            cellClassName: "whitespace-nowrap align-middle",
        },
        {
            id: "renter",
            header: "Leietaker",
            accessor: (machine) => getActiveCustomerLabel(machine) ?? "",
            cell: (machine) => {
                const customerLabel = getActiveCustomerLabel(machine);
                return customerLabel ? (
                    <span className="text-slate-700">{customerLabel}</span>
                ) : (
                    <span className="text-slate-400">-</span>
                );
            },
            sortValue: (machine) => (getActiveCustomerLabel(machine) ?? "").toLowerCase(),
            filterValue: (machine) => getActiveCustomerLabel(machine) ?? "-",
            cellClassName: "align-middle",
        },
        {
            id: "lastSeen",
            header: "Sist sett",
            accessor: (machine) =>
                machine.last_pos_reported_at ? formatLastUpdated(machine.last_pos_reported_at) : "",
            filterType: "date-range",
            dateValue: (machine) => machine.last_pos_reported_at ?? null,
            cell: (machine) => {
                const hasCoords = hasMachineCoords(machine);
                const last = machine.last_pos_reported_at ?? null;
                if (!hasCoords) {
                    return <span className="text-slate-400">Posisjon ikke tilgjengelig for denne enheten.</span>;
                }
                if (!last) {
                    return <span className="text-slate-400">-</span>;
                }
                return <span className="text-slate-600">{formatLastUpdated(last)}</span>;
            },
            sortValue: (machine) => {
                if (!machine.last_pos_reported_at) return -1;
                const parsed = new Date(machine.last_pos_reported_at);
                return Number.isNaN(parsed.getTime()) ? -1 : parsed.getTime();
            },
            filterValue: (machine) =>
                machine.last_pos_reported_at ? formatLastUpdated(machine.last_pos_reported_at) : "-",
            cellClassName: "min-w-[12rem] align-middle",
        },
    ];

    // ---------- helpers ----------
    function collectLayerIds(map: Map) {
        const style: any = map.getStyle();
        const layers: any[] = style?.layers ?? [];

        labelLayerIds.current = layers
            .filter((l) => l.type === "symbol" && l.layout?.["text-field"] && l.source !== "machines")
            .map((l) => l.id as string);

        roadLayerIds.current = layers
            .filter(
                (l) =>
                    String(l.id).match(/road|transportation/i) ||
                    String(l["source-layer"]).match(/road|transportation/i)
            )
            .map((l) => l.id as string);

        borderLayerIds.current = layers
            .filter(
                (l) =>
                    String(l.id).match(/boundary|border|admin/i) ||
                    String(l["source-layer"]).match(/boundary|border|admin/i)
            )
            .map((l) => l.id as string);
    }

    function setVisibility(map: Map, ids: string[], visible: boolean) {
        for (const id of ids) {
            try {
                map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
            } catch {
                /* ignore */
            }
        }
    }

    function reapplyAllVisibilities(map: Map) {
        collectLayerIds(map);
        setVisibility(map, labelLayerIds.current, labelsVisibleRef.current);
        setVisibility(map, roadLayerIds.current, roadsVisibleRef.current);
        setVisibility(map, borderLayerIds.current, bordersVisibleRef.current);
    }

    // (Re)add our source + layers safely
    function ensureDataLayers(map: Map, fc: MachinesFC) {
        if (!map.getSource("machines")) {
            map.addSource("machines", {
                type: "geojson",
                data: fc,
                cluster: true,
                clusterRadius: 50,
                clusterMaxZoom: 12,
            });
        } else {
            (map.getSource("machines") as GeoJSONSource).setData(fc);
        }

        if (!map.getLayer("clusters")) {
            map.addLayer({
                id: "clusters",
                type: "circle",
                source: "machines",
                filter: ["has", "point_count"],
                paint: {
                    "circle-color": ["step", ["get", "point_count"], c.cluster1, 10, c.cluster2, 25, c.cluster3],
                    "circle-radius": ["step", ["get", "point_count"], 14, 10, 18, 25, 24],
                    "circle-stroke-color": c.grayStroke,
                    "circle-stroke-width": 1.25,
                },
            });
        }

        if (!map.getLayer("cluster-count")) {
            map.addLayer({
                id: "cluster-count",
                type: "symbol",
                source: "machines",
                filter: ["has", "point_count"],
                layout: {
                    "text-field": ["get", "point_count_abbreviated"],
                    "text-size": 12,
                    // removed text-font to avoid glyph mismatch across styles
                },
                paint: { "text-halo-width": 1, "text-halo-color": c.grayStroke },
            });
        }

        if (!map.getLayer("unclustered-point")) {
            map.addLayer({
                id: "unclustered-point",
                type: "circle",
                source: "machines",
                filter: ["!", ["has", "point_count"]],
                paint: {
                    "circle-color": OEM_COLOR_EXPRESSION,
                    "circle-radius": 6,
                    "circle-stroke-width": 1.5,
                    "circle-stroke-color": c.grayStroke,
                },
            });
        } else {
            // Ensure color expression stays in sync if layer existed
            map.setPaintProperty("unclustered-point", "circle-color", OEM_COLOR_EXPRESSION); // NEW
        }

        if (!map.getLayer("unclustered-label")) {
            map.addLayer({
                id: "unclustered-label",
                type: "symbol",
                source: "machines",
                filter: ["!", ["has", "point_count"]],
                layout: {
                    "text-field": ["get", "name"],
                    "text-size": 11,
                    "text-offset": [0, 1.0],
                    "text-anchor": "top",
                    // removed text-font to avoid glyph mismatch across styles
                },
                paint: { "text-halo-width": 1, "text-halo-color": c.grayStroke },
            });
        }
    }

    function ensureHistoryLayers(map: Map, fc: HistoryFeatureCollection, color: string) {
        if (!map.getSource("machine-history")) {
            map.addSource("machine-history", {
                type: "geojson",
                data: fc,
            });
        } else {
            (map.getSource("machine-history") as GeoJSONSource).setData(fc);
        }

        if (!map.getLayer("machine-history-line")) {
            map.addLayer({
                id: "machine-history-line",
                type: "line",
                source: "machine-history",
                filter: ["==", ["geometry-type"], "LineString"],
                paint: {
                    "line-color": color,
                    "line-width": 3,
                    "line-opacity": 0.75,
                },
            });
        } else {
            map.setPaintProperty("machine-history-line", "line-color", color);
        }

        if (!map.getLayer("machine-history-point")) {
            map.addLayer({
                id: "machine-history-point",
                type: "circle",
                source: "machine-history",
                filter: ["==", ["geometry-type"], "Point"],
                paint: {
                    "circle-color": ["case", ["==", ["get", "is_current"], true], color, "#ffffff"],
                    "circle-radius": 4,
                    "circle-stroke-color": color,
                    "circle-stroke-width": 2,
                },
            });
        } else {
            map.setPaintProperty(
                "machine-history-point",
                "circle-color",
                ["case", ["==", ["get", "is_current"], true], color, "#ffffff"],
            );
            map.setPaintProperty("machine-history-point", "circle-stroke-color", color);
        }

        if (!map.getLayer("machine-history-selected")) {
            map.addLayer({
                id: "machine-history-selected",
                type: "circle",
                source: "machine-history",
                filter: ["all", ["==", ["geometry-type"], "Point"], ["==", ["get", "selected"], true]],
                paint: {
                    "circle-radius": 8,
                    "circle-color": "rgba(34, 197, 94, 0.18)",
                    "circle-stroke-color": "#22C55E",
                    "circle-stroke-width": 2,
                },
            });
        }

        if (!map.getLayer("machine-history-selected-inner")) {
            map.addLayer({
                id: "machine-history-selected-inner",
                type: "circle",
                source: "machine-history",
                filter: ["all", ["==", ["geometry-type"], "Point"], ["==", ["get", "selected"], true]],
                paint: {
                    "circle-radius": 2.5,
                    "circle-color": "#22C55E",
                },
            });
        }
    }

    function clearMachineHistory(map?: Map | null) {
        historyMachineIdRef.current = null;
        historyDataRef.current = emptyHistoryFeatureCollection();
        historyColorRef.current = OEM_COLORS.default;
        setHistoryEntries([]);
        setHistoryMachineName(null);
        setHistoryColor(OEM_COLORS.default);
        setHistoryOverlayOpen(false);
        setSelectedHistoryEntryId(null);
        setHistoryRangeStartIndex(0);
        setHistoryRangeEndIndex(0);
        setHistoryObservationGapMs(DEFAULT_HISTORY_INTERVAL_MS);
        historyRowRefs.current = {};

        const activeMap = map ?? mapRef.current;
        if (!activeMap || !loadedRef.current) return;

        const src = activeMap.getSource("machine-history") as GeoJSONSource | undefined;
        src?.setData(historyDataRef.current);
    }

    async function loadMachineHistory(
        machineId: string,
        machineName: string,
        oemName: string,
        map: Map,
        popup: maplibregl.Popup,
        popupContent: HTMLElement,
        button: HTMLButtonElement,
    ) {
        if (historyMachineIdRef.current && historyMachineIdRef.current !== machineId) {
            clearMachineHistory(map);
        }

        historyLoadingRef.current = true;
        setPopupActionsDisabled(popupContent, true);
        setHistoryButtonLoading(button);

        try {
            const response = await fetch(`/api/machines/${encodeURIComponent(machineId)}/location-history`, {
                cache: "no-store",
            });
            const payload = (await response.json().catch(() => ({}))) as {
                history?: MachinePositionHistoryEntry[];
                error?: string;
            };

            if (!response.ok) {
                throw new Error(payload.error || "Kunne ikke hente posisjonshistorikk");
            }

            const history = payload.history ?? [];
            if (!history.length) {
                clearMachineHistory(map);
                setHistoryButtonLabel(button, "Ingen bevegelser funnet");
                resetHistoryButton(button);
                return;
            }

            const nextSelectedHistoryEntryId = getLatestHistoryEntryId(history);

            historyMachineIdRef.current = machineId;
            historyColorRef.current = getOemColor(oemName);
            historyRowRefs.current = {};
            setHistoryEntries(history);
            setHistoryMachineName(machineName);
            setHistoryColor(historyColorRef.current);
            setHistoryOverlayOpen(true);
            setSelectedHistoryEntryId(nextSelectedHistoryEntryId);
            setHistoryRangeStartIndex(0);
            setHistoryRangeEndIndex(history.length - 1);
            setHistoryObservationGapMs(DEFAULT_HISTORY_INTERVAL_MS);
            ensureHistoryLayers(
                map,
                buildHistoryFeatureCollection(history, nextSelectedHistoryEntryId, nextSelectedHistoryEntryId),
                historyColorRef.current,
            );
            bringMachineLayersToTop(map);
            if (popupRef.current === popup) {
                popup.remove();
            }
            fitMapToCoordinates(
                map,
                history.map((entry) => [entry.lng, entry.lat] as [number, number]),
            );
        } catch (error) {
            console.error("Failed to load machine history", error);
            clearMachineHistory(map);
            setHistoryButtonLabel(button, "Kunne ikke hente bevegelser");
            resetHistoryButton(button);
        } finally {
            historyLoadingRef.current = false;
            if (popupRef.current === popup) {
                setPopupActionsDisabled(popupContent, false);
            }
        }
    }

    // add near other refs
    const popupRef = useRef<maplibregl.Popup | null>(null);

    function openPopupForFeature(map: Map, f: MachineFeature, opts?: { sticky?: boolean }) {
        if (historyLoadingRef.current) return;

        // close existing popup
        if (popupRef.current) {
            try { popupRef.current.remove(); } catch { }
            popupRef.current = null;
        }

        const coords = (f.geometry as Point).coordinates.slice() as [number, number];
        const props = (f.properties ?? {}) as MachineProps;
        const id = props.id ?? "-";
        const name = props.name ?? "Maskin";
        const oemName = props.oem_name ?? "N/A";
        const listMachine = machineList.find((machine) => String(machine.id) === String(id));
        const agreement = listMachine ? getAgreementDialogInput(listMachine) : null;
        const logoSrc = getOEMLogo(oemName);
        const categoryValue = formatPopupValue(props.category);
        const activeAgreementId = agreement != null ? String(agreement.id) : null;
        const renterValue = formatPopupValue(
            listMachine
                ? getActiveCustomerLabel(listMachine)
                : getActiveCustomerLabel({
                    active_customer_name: props.active_customer_name,
                    active_customer_id: props.active_customer_id,
                }),
        );
        const lastSeenValue = formatPopupValue(
            props.last_pos_reported_at ? formatLastUpdated(props.last_pos_reported_at) : "",
        );

        const popupContent = buildPopupContent({
            id: String(id),
            name,
            oemName,
            logoSrc,
            categoryValue,
            activeAgreementId,
            renterValue,
            lastSeenValue,
        });

        const popup = new maplibregl.Popup({
            closeOnMove: !(opts?.sticky),
            closeOnClick: false,
            closeButton: false,
            className: "machine-popup",
            offset: 12,
        })
            .setLngLat(coords)
            .setDOMContent(popupContent)
            .addTo(map);

        popupContent.querySelector<HTMLButtonElement>("[data-popup-close]")?.addEventListener("click", () => {
            popup.remove();
        });

        popupContent.querySelector<HTMLButtonElement>("[data-show-history]")?.addEventListener("click", () => {
            const historyButton = popupContent.querySelector<HTMLButtonElement>("[data-show-history]");
            if (!historyButton || historyButton.disabled) return;
            void loadMachineHistory(
                String(id),
                name,
                oemName,
                map,
                popup,
                popupContent,
                historyButton,
            );
        });

        popupContent.querySelector<HTMLButtonElement>("[data-show-details]")?.addEventListener("click", () => {
            popup.remove();
            const numericMachineId = Number(id);
            if (!Number.isFinite(numericMachineId)) return;
            openMachineDialogRef.current?.(numericMachineId, name);
        });

        popupContent.querySelector<HTMLButtonElement>("[data-open-agreement]")?.addEventListener("click", () => {
            if (!agreement) return;
            popup.remove();
            openAgreementDialogRef.current?.(agreement);
        });

        popup.on("close", () => {
            if (popupRef.current === popup) {
                popupRef.current = null;
            }
            // clear highlight only if it belonged to this popup
            setSelectedId((prev) => (String(prev) === String(id) ? null : prev));
        });

        popupRef.current = popup;
        setSelectedId(id ?? null); // highlight row
    }



    function focusMachineById(id: string | number) {
        if (historyLoadingRef.current) return;

        const map = mapRef.current;
        if (!map) return;
        const f = visibleFeatures.features.find((x) => String(x.properties?.id) === String(id));
        if (!f) return;

        const coords = (f.geometry as Point).coordinates as [number, number];
        // center/zoom first
        map.easeTo({ center: coords, zoom: Math.max(map.getZoom(), 13) });

        // open popup when movement is done so it doesn't auto-close
        map.once("moveend", () => openPopupForFeature(map, f, { sticky: true }));
    }

    // Keep machine layers on top & ensure interactions once
    function bringMachineLayersToTop(map: Map) {
        const ids = ["clusters", "cluster-count", "unclustered-point", "unclustered-label"];
        for (const id of ids) {
            if (map.getLayer(id)) {
                try {
                    map.moveLayer(id);
                } catch {
                    /* ignore */
                }
            }
        }
    }

    function ensureInteractions(map: Map) {
        const key = "__machinesHandlersAttached";
        if ((map as any)[key]) return;

        // Cluster click to expand
        map.on("click", "clusters", async (e) => {
            const feats = map.queryRenderedFeatures(e.point, { layers: ["clusters"] });
            const f = feats[0];
            if (!f) return;
            const clusterId = (f.properties as any)?.cluster_id as number | undefined;
            if (clusterId == null) return;
            const coords = (f.geometry as any).coordinates as [number, number];
            const src = map.getSource("machines") as maplibregl.GeoJSONSource;
            const zoom = await src.getClusterExpansionZoom(clusterId);
            map.easeTo({ center: coords, zoom });
        });

        // Single machine click popup
        map.on("click", "unclustered-point", (e) => {
            const f = e.features?.[0] as MachineFeature | undefined;
            if (!f) return;
            openPopupForFeature(map, f, { sticky: false });
        });

        map.on("click", "machine-history-point", (e) => {
            const feature = e.features?.[0];
            const historyId = typeof feature?.properties?.history_id === "string"
                ? feature.properties.history_id
                : null;
            if (!historyId) return;
            setSelectedHistoryEntryId(historyId);
        });

        // Cursor
        map.on("mouseenter", "clusters", () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", "clusters", () => (map.getCanvas().style.cursor = ""));
        map.on("mouseenter", "unclustered-point", () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", "unclustered-point", () => (map.getCanvas().style.cursor = ""));
        map.on("mouseenter", "machine-history-point", () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", "machine-history-point", () => (map.getCanvas().style.cursor = ""));

        (map as any)[key] = true;
    }

    // ---------- init map ----------
    useEffect(() => {
        if (!containerRef.current || mapRef.current) return;

        const styleUrl = MAPTILER_KEY
            ? `https://api.maptiler.com/maps/streets-v2/style.json?key=${MAPTILER_KEY}`
            : "https://demotiles.maplibre.org/style.json";

        const map = new maplibregl.Map({
            container: containerRef.current,
            style: styleUrl,
            center: [10.7522, 59.9139], // Oslo
            zoom: 4,
            attributionControl: { compact: true },
            hash: false,
            pitchWithRotate: false,
            dragRotate: false,
        });
        mapRef.current = map;

        map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), "top-right");
        map.addControl(new maplibregl.ScaleControl({ maxWidth: 150, unit: "metric" }));
        map.addControl(
            new maplibregl.GeolocateControl({
                positionOptions: { enableHighAccuracy: true },
                trackUserLocation: false,
                showAccuracyCircle: false,
            }),
            "top-right"
        );

        map.on("load", () => {
            loadedRef.current = true;
            ensureDataLayers(map, visibleFeatures);
            ensureHistoryLayers(map, historyDataRef.current, historyColorRef.current);
            reapplyAllVisibilities(map);
            applyLabelContrast(map, theme);
            bringMachineLayersToTop(map);
            ensureInteractions(map);
            fitToFeatures(map, visibleFeatures);
        });

        // Resize listener
        const ro = new ResizeObserver(() => map.resize());
        if (containerRef.current) ro.observe(containerRef.current);

        return () => {
            ro.disconnect();
            map.remove();
            mapRef.current = null;
            loadedRef.current = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // create once

    // ---------- theme swap (no camera jump, no blink) ----------
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !loadedRef.current || !MAPTILER_KEY) return;
        const stableMap = map;
        if (appliedThemeRef.current === theme) return;

        const url =
            theme === "dark"
                ? `https://api.maptiler.com/maps/streets-v2-dark/style.json?key=${MAPTILER_KEY}`
                : `https://api.maptiler.com/maps/streets-v2/style.json?key=${MAPTILER_KEY}`;

        let cancelled = false;

        async function swapStyle() {
            let baseStyle = styleCacheRef.current[theme];
            if (!baseStyle) {
                const res = await fetch(url);
                if (!res.ok) return;
                baseStyle = (await res.json()) as StyleSpecification;
                styleCacheRef.current[theme] = baseStyle;
            }
            if (cancelled || !baseStyle) return;

            const nextStyle = cloneStyle(baseStyle);
            addMachinesToStyle(nextStyle, visibleFeatures);
            addHistoryToStyle(nextStyle, historyDataRef.current, historyColorRef.current);
            applyVisibilityToStyle(nextStyle, {
                labels: labelsVisibleRef.current,
                roads: roadsVisibleRef.current,
                borders: bordersVisibleRef.current,
            });

            appliedThemeRef.current = theme;
            stableMap.setStyle(nextStyle, { diff: true });

            // Re-attach once the new style (+glyphs) is fully ready
            stableMap.once("style.load", () => {
                ensureDataLayers(stableMap, visibleFeatures);
                ensureHistoryLayers(stableMap, historyDataRef.current, historyColorRef.current);
                reapplyAllVisibilities(stableMap);
                applyLabelContrast(stableMap, themeRef.current);
                bringMachineLayersToTop(stableMap);
            });
        }

        swapStyle();
        return () => {
            cancelled = true;
        };
    }, [theme, visibleFeatures]);

    // ---------- visibility toggles ----------
    useEffect(() => {
        themeRef.current = theme;
    }, [theme]);

    useEffect(() => {
        const map = mapRef.current;
        if (!map || !loadedRef.current) return;
        applyLabelContrast(map, theme);
    }, [theme]);

    useEffect(() => {
        labelsVisibleRef.current = labelsVisible;
        const map = mapRef.current;
        if (!map || !loadedRef.current) return;
        setVisibility(map, labelLayerIds.current, labelsVisible);
    }, [labelsVisible]);

    useEffect(() => {
        roadsVisibleRef.current = roadsVisible;
        const map = mapRef.current;
        if (!map || !loadedRef.current) return;
        setVisibility(map, roadLayerIds.current, roadsVisible);
    }, [roadsVisible]);

    useEffect(() => {
        bordersVisibleRef.current = bordersVisible;
        const map = mapRef.current;
        if (!map || !loadedRef.current) return;
        setVisibility(map, borderLayerIds.current, bordersVisible);
    }, [bordersVisible]);

    // ---------- data updates ----------
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !loadedRef.current) return;
        const src = map.getSource("machines") as GeoJSONSource | undefined;
        if (src) {
            src.setData(visibleFeatures);
            fitToFeatures(map, visibleFeatures, { onlyIfChanged: true });
        }
    }, [visibleFeatures]);

    useEffect(() => {
        if (!filteredHistoryEntries.length) {
            if (selectedHistoryEntryId !== null) {
                setSelectedHistoryEntryId(null);
            }
            return;
        }

        if (selectedHistoryEntryId && filteredHistoryEntries.some((entry) => entry.id === selectedHistoryEntryId)) {
            return;
        }

        setSelectedHistoryEntryId(currentHistoryEntryId);
    }, [filteredHistoryEntries, selectedHistoryEntryId, currentHistoryEntryId]);

    useEffect(() => {
        historyDataRef.current = buildHistoryFeatureCollection(
            filteredHistoryEntries,
            selectedHistoryEntryId,
            currentHistoryEntryId,
        );
        const map = mapRef.current;
        if (!map || !loadedRef.current) return;
        const src = map.getSource("machine-history") as GeoJSONSource | undefined;
        src?.setData(historyDataRef.current);
    }, [filteredHistoryEntries, selectedHistoryEntryId, currentHistoryEntryId]);

    useEffect(() => {
        if (!selectedHistoryEntryId || !historyOverlayOpen) return;
        const row = historyRowRefs.current[selectedHistoryEntryId];
        row?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, [selectedHistoryEntryId, historyOverlayOpen]);

    const updateHistoryOverlayScrollMode = useCallback(() => {
        if (!historyOverlayOpen) {
            setHistoryOverlayUsesFullCardScroll(false);
            return;
        }

        const card = historyOverlayCardRef.current;
        const header = historyOverlayHeaderRef.current;
        const filters = historyOverlayFiltersRef.current;
        if (!card || !header || !filters) return;

        const availableObservationsHeight = card.clientHeight - header.offsetHeight - filters.offsetHeight;
        const titleHeight =
            historyObservationsTitleRef.current?.offsetHeight ?? HISTORY_OVERLAY_OBSERVATIONS_TITLE_FALLBACK_PX;
        const rowElements = Array.from(
            card.querySelectorAll<HTMLElement>("[data-history-observation-row='true']"),
        );
        const rowsToKeepVisible = Math.min(
            HISTORY_OVERLAY_MIN_VISIBLE_OBSERVATIONS,
            Math.max(rowElements.length, 1),
        );
        const visibleRowsHeight = rowElements
            .slice(0, rowsToKeepVisible)
            .reduce((sum, row) => sum + row.offsetHeight, 0);
        const fallbackRowsHeight = rowsToKeepVisible * HISTORY_OVERLAY_OBSERVATION_ROW_FALLBACK_PX;
        const requiredObservationsHeight =
            titleHeight +
            (visibleRowsHeight || fallbackRowsHeight) +
            HISTORY_OVERLAY_COMPACT_SCROLL_BUFFER_PX;

        setHistoryOverlayUsesFullCardScroll(availableObservationsHeight <= requiredObservationsHeight);
    }, [historyOverlayOpen]);

    useLayoutEffect(() => {
        if (!historyOverlayOpen) {
            setHistoryOverlayUsesFullCardScroll(false);
            return;
        }

        updateHistoryOverlayScrollMode();

        const observer = new ResizeObserver(() => {
            updateHistoryOverlayScrollMode();
        });

        if (containerRef.current) observer.observe(containerRef.current);
        if (historyOverlayCardRef.current) observer.observe(historyOverlayCardRef.current);
        if (historyOverlayHeaderRef.current) observer.observe(historyOverlayHeaderRef.current);
        if (historyOverlayFiltersRef.current) observer.observe(historyOverlayFiltersRef.current);
        if (historyObservationsTitleRef.current) observer.observe(historyObservationsTitleRef.current);

        return () => {
            observer.disconnect();
        };
    }, [historyOverlayOpen, historyEntriesDesc.length, updateHistoryOverlayScrollMode]);

    // ---------- bottom panel size/collapse with click-or-drag divider ----------
    const [panelPx, setPanelPx] = useState<number>(280);
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [isDraggingPanel, setIsDraggingPanel] = useState(false);
    const [isHoldingDivider, setIsHoldingDivider] = useState(false);
    const [isWindowResizing, setIsWindowResizing] = useState(false);
    const draggingRef = useRef(false);
    const resizeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const dragStartYRef = useRef(0);
    const panelStartRef = useRef(panelPx);
    const panelPxRef = useRef(280);
    const collapsedRef = useRef(false);
    const movedRef = useRef(false);
    const lastNonZeroRef = useRef(280);
    const CLICK_THRESHOLD_PX = 5;

    function applyPanelLayout(nextPanelPx: number, nextCollapsed: boolean) {
        panelPxRef.current = nextPanelPx;
        collapsedRef.current = nextCollapsed;

        if (mapViewportRef.current) {
            mapViewportRef.current.style.height = nextCollapsed ? "100vh" : `calc(100vh - ${nextPanelPx}px)`;
        }

        if (bottomPanelRef.current) {
            bottomPanelRef.current.style.height = nextCollapsed ? "0px" : `${nextPanelPx}px`;
        }

        if (historyOverlayRef.current) {
            const nextHistoryOverlayStyle = getHistoryOverlayLayout(nextPanelPx, nextCollapsed);
            historyOverlayRef.current.style.top = nextHistoryOverlayStyle.top;
            historyOverlayRef.current.style.bottom = nextHistoryOverlayStyle.bottom;
        }
    }

    useEffect(() => {
        applyPanelLayout(panelPx, isCollapsed);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [panelPx, isCollapsed]);

    useEffect(() => {
        function onMove(e: MouseEvent) {
            if (!draggingRef.current) return;
            const dy = dragStartYRef.current - e.clientY;
            if (Math.abs(dy) > CLICK_THRESHOLD_PX) movedRef.current = true;
            const next = Math.max(0, panelStartRef.current + dy);
            const nextCollapsed = next === 0;
            if (next > 0) {
                lastNonZeroRef.current = next;
            }
            applyPanelLayout(next, nextCollapsed);
        }
        function onUp() {
            if (!draggingRef.current) return;
            draggingRef.current = false;
            setIsDraggingPanel(false);
            setIsHoldingDivider(false);
            let nextPanelPx = panelPxRef.current;
            let nextCollapsed = collapsedRef.current;
            // If mouse didn't move → treat as click toggle
            if (!movedRef.current) {
                if (collapsedRef.current) {
                    const h = Math.max(120, lastNonZeroRef.current || 280);
                    nextPanelPx = h;
                    nextCollapsed = false;
                } else {
                    nextPanelPx = 0;
                    nextCollapsed = true;
                }

                applyPanelLayout(nextPanelPx, nextCollapsed);
            }

            setPanelPx(nextPanelPx);
            setIsCollapsed(nextCollapsed);
        }
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
        return () => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
        };
    }, []);

    useEffect(() => {
        function handleWindowResize() {
            setIsWindowResizing(true);
            if (resizeTimeoutRef.current) {
                clearTimeout(resizeTimeoutRef.current);
            }
            resizeTimeoutRef.current = setTimeout(() => {
                setIsWindowResizing(false);
                resizeTimeoutRef.current = null;
            }, 140);
        }

        window.addEventListener("resize", handleWindowResize);
        return () => {
            window.removeEventListener("resize", handleWindowResize);
            if (resizeTimeoutRef.current) {
                clearTimeout(resizeTimeoutRef.current);
            }
        };
    }, []);

    const mapHeightStyle = isCollapsed ? { height: "100vh" } : { height: `calc(100vh - ${panelPx}px)` };
    const historyOverlayStyle = getHistoryOverlayLayout(panelPx, isCollapsed);
    const shouldShowResizeOverlay = isHoldingDivider || isWindowResizing;

    return (
        <DialogFlowHost viewer={session?.user}>
            {({ openAgreement, openMachine }) => {
                openAgreementDialogRef.current = (agreement) => {
                    openAgreement(agreement);
                };
                openMachineDialogRef.current = (machineId, machineLabel) => {
                    void openMachine({ id: machineId, name: machineLabel });
                };

                return (
                    <div className="relative flex h-screen w-full flex-col">
                        {/* Controls (top-left stack) */}
                        <div className="pointer-events-none absolute left-3 top-3 z-10 flex flex-col gap-2">
                            <div className="pointer-events-auto">
                                <SegmentedIconToggle
                                    value={theme === "light"}
                                    onChange={(on) => setTheme(on ? "light" : "dark")}
                                    LeftIcon={IconSun}
                                    RightIcon={IconMoon}
                                    ariaLabel="Map style"
                                    title="Kartstil"
                                    leftTitle="Lyst kart"
                                    rightTitle="Mørkt kart"
                                />
                            </div>
                            <div className="pointer-events-auto">
                                <SegmentedIconToggle
                                    value={labelsVisible}
                                    onChange={(on) => setLabelsVisible(on)}
                                    LeftIcon={IconWriting}
                                    RightIcon={IconWritingOff}
                                    ariaLabel="Place names"
                                    title="Stedsnavn"
                                    leftTitle="Vis stedsnavn"
                                    rightTitle="Skjul stedsnavn"
                                />
                            </div>
                            <div className="pointer-events-auto">
                                <SegmentedIconToggle
                                    value={bordersVisible}
                                    onChange={(on) => setBordersVisible(on)}
                                    LeftIcon={IconFlag}
                                    RightIcon={IconFlagOff}
                                    ariaLabel="Borders"
                                    title="Grenser"
                                    leftTitle="Vis grenser"
                                    rightTitle="Skjul grenser"
                                />
                            </div>
                            <div className="pointer-events-auto">
                                <SegmentedIconToggle
                                    value={roadsVisible}
                                    onChange={(on) => setRoadsVisible(on)}
                                    LeftIcon={IconRoad}
                                    RightIcon={IconRoadOff}
                                    ariaLabel="Roads"
                                    title="Veger/veier"
                                    leftTitle="Vis veier"
                                    rightTitle="Skjul veier"
                                />
                            </div>
                        </div>

                        {/* Map */}
                        <div ref={mapViewportRef} className="relative w-full" style={mapHeightStyle}>
                            <div
                                className={`h-full w-full transition-opacity duration-75 ${shouldShowResizeOverlay ? "opacity-0" : "opacity-100"}`}
                            >
                                <div
                                    ref={containerRef}
                                    className="relative h-full w-full overflow-hidden"
                                />
                            </div>
                            {shouldShowResizeOverlay ? (
                            <div
                                ref={resizeOverlayRef}
                                className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-slate-900/12 backdrop-blur-[2px]"
                                aria-hidden="true"
                            >
                                <div className="rounded-2xl border border-white/50 bg-white/80 px-6 py-5 shadow-lg backdrop-blur-md">
                                    <Image
                                        src="/bjugstad-logos/horizontal/Color.png"
                                        alt="Bjugstad Utleie"
                                        width={220}
                                        height={56}
                                        className="h-12 w-auto object-contain"
                                        priority={false}
                                    />
                                </div>
                            </div>
                            ) : null}
                        </div>

                        {historyOverlayOpen ? (
                            <div
                                ref={historyOverlayRef}
                                className="pointer-events-none absolute right-5 z-10 flex w-[min(14rem,calc(100vw-2.5rem))] items-center"
                                style={historyOverlayStyle}
                            >
                                <div
                                    ref={historyOverlayCardRef}
                                    className={`pointer-events-auto flex max-h-full w-full flex-col rounded-2xl border border-slate-200 bg-white/95 shadow-xl backdrop-blur ${historyOverlayUsesFullCardScroll
                                        ? "overflow-y-auto overscroll-contain"
                                        : "overflow-hidden"
                                        }`}
                                >
                                    <div
                                        ref={historyOverlayHeaderRef}
                                        className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3"
                                    >
                                        <div className="min-w-0">
                                            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                                                Siste bevegelser
                                            </div>
                                            <div className="truncate text-sm font-semibold text-slate-900">
                                                {historyMachineName ?? "Maskin"}
                                            </div>
                                            <div className="text-xs text-slate-500">
                                                {historyEntriesDesc.length === historyEntries.length
                                                    ? `${historyEntriesDesc.length} posisjoner`
                                                    : `${historyEntriesDesc.length} av ${historyEntries.length} posisjoner vises`}
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => clearMachineHistory()}
                                            className="cursor-pointer rounded-full p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                                            aria-label="Lukk historikk"
                                            title="Lukk historikk"
                                        >
                                            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
                                            </svg>
                                        </button>
                                    </div>
                                    <div ref={historyOverlayFiltersRef} className="border-b border-slate-200 py-3">
                                        <section className="space-y-2 px-4">
                                            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                                                Tidsrom
                                            </div>
                                            <HistoryRangeSlider
                                                min={0}
                                                max={maxHistoryIndex}
                                                startValue={safeHistoryRangeStartIndex}
                                                endValue={safeHistoryRangeEndIndex}
                                                disabled={historyEntries.length < 2}
                                                onStartChange={(nextValue) => {
                                                    setHistoryRangeStartIndex(Math.min(nextValue, safeHistoryRangeEndIndex));
                                                }}
                                                onEndChange={(nextValue) => {
                                                    setHistoryRangeEndIndex(Math.max(nextValue, safeHistoryRangeStartIndex));
                                                }}
                                            />
                                            <div className="flex items-start justify-between gap-3 text-[11px] text-slate-500">
                                                <span className="min-w-0 whitespace-pre-line leading-tight">
                                                    {historyRangeStartEntry
                                                        ? formatHistoryFilterTimestamp(historyRangeStartEntry.reported_at)
                                                        : "Tidligst"}
                                                </span>
                                                <span className="min-w-0 whitespace-pre-line text-right leading-tight">
                                                    {historyRangeEndEntry
                                                        ? formatHistoryFilterTimestamp(historyRangeEndEntry.reported_at)
                                                        : "Senest"}
                                                </span>
                                            </div>
                                        </section>

                                        <div className="mt-4 border-t border-slate-200" />

                                        <section className="space-y-2 px-4 pt-4">
                                            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                                                Observasjonsfrekvens
                                            </div>
                                            <div className="flex flex-wrap gap-1.5">
                                                {HISTORY_INTERVAL_OPTIONS.map((option) => {
                                                    const active = option.valueMs === historyObservationGapMs;
                                                    return (
                                                        <button
                                                            key={option.valueMs}
                                                            type="button"
                                                            onClick={() => setHistoryObservationGapMs(option.valueMs)}
                                                            className={`cursor-pointer rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${active
                                                                ? "border-sky-300 bg-sky-50 text-sky-700"
                                                                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900"
                                                                }`}
                                                        >
                                                            {option.label}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </section>
                                    </div>
                                    <div
                                        className={historyOverlayUsesFullCardScroll ? "px-3 py-3" : "min-h-0 flex-1 overflow-auto px-3 py-3"}
                                    >
                                        <div
                                            ref={historyObservationsTitleRef}
                                            className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500"
                                        >
                                            Observasjoner
                                        </div>
                                        {historyEntriesDesc.length ? (
                                            <div className="relative pt-2">
                                                {historyEntriesDesc.length > 1 ? (
                                                    <div
                                                        className="absolute bottom-4 left-4 top-4 w-px"
                                                        style={{ backgroundColor: historyColor }}
                                                    />
                                                ) : null}
                                                <div className="space-y-0.5">
                                                    {historyEntriesDesc.map((entry, index) => (
                                                        <button
                                                            key={entry.id}
                                                            type="button"
                                                            data-history-observation-row="true"
                                                            ref={(node) => {
                                                                historyRowRefs.current[entry.id] = node;
                                                            }}
                                                            onClick={() => {
                                                                setSelectedHistoryEntryId(entry.id);
                                                                mapRef.current?.easeTo({
                                                                    center: [entry.lng, entry.lat],
                                                                    zoom: Math.max(mapRef.current?.getZoom() ?? 0, 14),
                                                                    duration: 400,
                                                                });
                                                            }}
                                                            className="relative block w-full pl-11 pr-1 py-1.5 text-left"
                                                        >
                                                            <div className="absolute left-1 top-1.5 flex w-6 justify-center">
                                                                <div
                                                                    className="relative flex h-3 w-3 items-center justify-center rounded-full border-2 bg-white shadow-sm"
                                                                    style={{
                                                                        borderColor: historyColor,
                                                                        backgroundColor:
                                                                            entry.id === currentHistoryEntryId ? historyColor : "#ffffff",
                                                                    }}
                                                                >
                                                                    {selectedHistoryEntryId === entry.id ? (
                                                                        <>
                                                                            <span className="absolute inset-[-4px] rounded-full border-2 border-[#22C55E]" />
                                                                            <span className="h-1.5 w-1.5 rounded-full bg-[#22C55E]" />
                                                                        </>
                                                                    ) : null}
                                                                </div>
                                                            </div>
                                                            <div className="min-w-0">
                                                                <div className="text-sm font-semibold leading-tight text-slate-900">
                                                                    {formatLastUpdated(entry.reported_at)}
                                                                </div>
                                                                {index < historyEntriesDesc.length - 1 ? (
                                                                    <div className="pt-2 text-[11px] font-medium leading-none text-slate-400">
                                                                        {formatDurationBetween(
                                                                            entry.reported_at,
                                                                            historyEntriesDesc[index + 1]?.reported_at,
                                                                        )}
                                                                    </div>
                                                                ) : null}
                                                            </div>
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
                                                Ingen tidligere posisjoner funnet for denne maskinen.
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ) : null}

                        {/* Divider (click = toggle, drag = resize) - SHORTER HEIGHT */}
                        <div
                            className="relative z-10 h-1.5 w-full cursor-row-resize bg-gradient-to-b from-transparent to-transparent hover:from-slate-200/60 hover:to-transparent"
                            onMouseDown={(e) => {
                                draggingRef.current = true;
                                setIsDraggingPanel(true);
                                setIsHoldingDivider(true);
                                dragStartYRef.current = e.clientY;
                                panelStartRef.current = panelPxRef.current;
                                movedRef.current = false;
                            }}
                            title="Klikk for å skjule/vise, dra for å endre høyde"
                            aria-label="Skille mellom kart og tabell"
                        >
                            <div className="absolute left-1/2 top-0 -translate-x-1/2">
                                <div className="h-1.5 w-12 rounded-full bg-slate-300" />
                            </div>
                        </div>

                        {/* Bottom panel (all machines) */}
                        <div
                            ref={bottomPanelRef}
                            className={`w-full border-t border-slate-200 bg-white ${isDraggingPanel ? "transition-none" : "transition-[height] duration-150"} ${isCollapsed ? "h-0 overflow-hidden" : "overflow-hidden"
                                }`}
                            style={{ height: isCollapsed ? 0 : panelPx }}
                        >
                            <div className="h-full min-h-0 overflow-hidden">
                                <DataTable
                                    data={machineList}
                                    columns={columns}
                                    getRowId={(machine, index) => String(machine.id ?? index)}
                                    emptyMessage="Ingen maskiner a vise."
                                    defaultSort={{ columnId: "lastSeen", direction: "desc" }}
                                    onRowClick={(machine) => {
                                        if (hasMachineCoords(machine)) {
                                            focusMachineById(String(machine.id));
                                        }
                                    }}
                                    isRowClickable={(machine) => hasMachineCoords(machine)}
                                    getRowClassName={(machine) => {
                                        const hasCoords = hasMachineCoords(machine);
                                        const isSelected = String(selectedId) === String(machine.id);
                                        return [
                                            isSelected ? "bg-blue-50/60 ring-1 ring-inset ring-blue-300" : "",
                                            !hasCoords ? "cursor-default hover:bg-transparent" : "",
                                        ]
                                            .filter(Boolean)
                                            .join(" ");
                                    }}
                                    onVisibleRowsChange={handleVisibleRowsChange}
                                    fillHeight
                                />
                            </div>
                        </div>
                    </div>
                );
            }}
        </DialogFlowHost>
    );
}

/** Reusable segmented toggle */
function SegmentedIconToggle({
    value,
    onChange,
    LeftIcon,
    RightIcon,
    ariaLabel,
    title,
    leftTitle,
    rightTitle,
}: {
    value: boolean;
    onChange: (v: boolean) => void;
    LeftIcon: React.ComponentType<{ className?: string }>;
    RightIcon: React.ComponentType<{ className?: string }>;
    ariaLabel: string;
    title?: string;
    leftTitle?: string;
    rightTitle?: string;
}) {
    return (
        <div
            role="tablist"
            aria-label={ariaLabel}
            title={title}
            className="flex overflow-hidden divide-x divide-slate-200 rounded-full border border-slate-300 bg-white shadow-md"
            onKeyDown={(e) => {
                if (e.key === "ArrowLeft" || e.key === "ArrowRight") onChange(!value);
            }}
        >
            {/* LEFT = ON */}
            <button
                role="tab"
                aria-selected={value}
                title={leftTitle}
                className={`group inline-flex items-center px-3 py-2 outline-none transition ${value ? "bg-slate-100 text-slate-900 ring-1 ring-slate-300" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                    }`}
                onClick={() => onChange(true)}
            >
                <LeftIcon className={`h-5 w-5 ${value ? "" : "opacity-60"}`} />
            </button>

            {/* RIGHT = OFF */}
            <button
                role="tab"
                aria-selected={!value}
                title={rightTitle}
                className={`group inline-flex items-center px-3 py-2 outline-none transition ${!value ? "bg-slate-100 text-slate-900 ring-1 ring-slate-300" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                    }`}
                onClick={() => onChange(false)}
            >
                <RightIcon className={`h-5 w-5 ${!value ? "" : "opacity-60"}`} />
            </button>
        </div>
    );
}

function HistoryRangeSlider({
    min,
    max,
    startValue,
    endValue,
    disabled,
    onStartChange,
    onEndChange,
}: {
    min: number;
    max: number;
    startValue: number;
    endValue: number;
    disabled?: boolean;
    onStartChange: (value: number) => void;
    onEndChange: (value: number) => void;
}) {
    const total = Math.max(max - min, 1);
    const startPercent = ((startValue - min) / total) * 100;
    const endPercent = ((endValue - min) / total) * 100;
    const trackLeft = disabled ? 0 : startPercent;
    const trackWidth = disabled ? 100 : Math.max(endPercent - startPercent, 0);
    const rangeInputClass = `pointer-events-none absolute inset-0 h-8 w-full appearance-none bg-transparent ${disabled ? "opacity-50" : ""} [&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:mt-[-6px] [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-sky-300 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-sm [&::-moz-range-track]:h-1 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-transparent [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-sky-300 [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:shadow-sm`;

    return (
        <div className="relative h-8">
            <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-slate-200" />
            <div
                className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-sky-500"
                style={{ left: `${trackLeft}%`, width: `${trackWidth}%` }}
            />
            <input
                type="range"
                min={min}
                max={max}
                step={1}
                value={startValue}
                disabled={disabled}
                onChange={(event) => onStartChange(Number(event.target.value))}
                className={rangeInputClass}
                aria-label="Start for tidsrom"
            />
            <input
                type="range"
                min={min}
                max={max}
                step={1}
                value={endValue}
                disabled={disabled}
                onChange={(event) => onEndChange(Number(event.target.value))}
                className={`${rangeInputClass} z-10`}
                aria-label="Slutt for tidsrom"
            />
        </div>
    );
}


// ---------- HELPER FUNCTIONS ----------

function hasMachineCoords(machine: MachineListEntry) {
    return Number.isFinite(machine.lng) && Number.isFinite(machine.lat);
}

function getActiveCustomerLabel(machine: Pick<MachineListEntry, "active_customer_name" | "active_customer_id">) {
    const customerName = machine.active_customer_name?.trim();
    if (customerName) return customerName;
    if (machine.active_customer_id != null) return `Kunde ${machine.active_customer_id}`;
    return null;
}

function getAgreementDialogInput(machine: MachineListEntry): DialogAgreementInput | null {
    const agreement = machine.active_agreement;
    if (agreement?.id) {
        const customerName = agreement.customerName?.trim() || getActiveCustomerLabel({
            active_customer_name: machine.active_customer_name,
            active_customer_id: machine.active_customer_id,
        });

        return {
            id: agreement.id,
            customer:
                agreement.customerId != null || customerName
                    ? {
                        id: agreement.customerId ?? undefined,
                        name: customerName ?? undefined,
                    }
                    : undefined,
            startDate: agreement.startDate ?? null,
            endDate: agreement.endDate ?? null,
            comment: agreement.comment ?? null,
            projectNumber: agreement.projectNumber ?? null,
            contactPersonName: agreement.contactPersonName ?? null,
            contactPersonTelephoneNumber: agreement.contactPersonTelephoneNumber ?? null,
            contactPersonEmail: agreement.contactPersonEmail ?? null,
            customerContactPersonId: agreement.customerContactPersonId ?? null,
            customerContactPersonName: agreement.customerContactPersonName ?? null,
            customerContactPersonTelephoneNumber: agreement.customerContactPersonTelephoneNumber ?? null,
            customerContactPersonEmail: agreement.customerContactPersonEmail ?? null,
            insuranceIncluded: agreement.insuranceIncluded ?? null,
            contractPrice: agreement.contractPrice ?? null,
            location: agreement.location ?? null,
            createdBy: agreement.createdBy ?? null,
            createdByTelephoneNumber: agreement.createdByTelephoneNumber ?? null,
            machines: agreement.machines ?? [],
        };
    }

    const agreementId = machine.active_agreement_id?.trim();
    if (!agreementId) return null;

    const customerName = getActiveCustomerLabel(machine);

    return {
        id: agreementId,
        customer:
            machine.active_customer_id != null || customerName
                ? {
                    id: machine.active_customer_id ?? undefined,
                    name: customerName ?? undefined,
                }
                : undefined,
        machines: [],
    };
}

function getOemFilterKey(oemName: string) {
    return getOEMLogo(oemName) ?? "/oem-logos/no_image_default.svg";
}

function formatOemFilterLabel(src: string) {
    const file = src.split("/").pop() ?? "";
    const cleaned = file.replace(/_logo/gi, "").replace(/\.(svg|png|jpg|jpeg)$/gi, "");
    const label = cleaned.replace(/[-_]+/g, " ").trim();
    if (!label || /no image default/i.test(label)) return "Andre";
    return toTitleCase(label);
}

function getLatestHistoryEntryId(history: MachinePositionHistoryEntry[]) {
    if (!history.length) return null;

    return history.reduce<MachinePositionHistoryEntry | null>((latest, entry) => {
        if (!latest) return entry;

        const latestReportedAt = new Date(latest.reported_at).getTime();
        const entryReportedAt = new Date(entry.reported_at).getTime();
        if (entryReportedAt > latestReportedAt) return entry;
        if (entryReportedAt < latestReportedAt) return latest;

        const latestReceivedAt = new Date(latest.received_at).getTime();
        const entryReceivedAt = new Date(entry.received_at).getTime();
        return entryReceivedAt > latestReceivedAt ? entry : latest;
    }, null)?.id ?? null;
}

function clamp(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), max);
}

function getHistoryOverlayLayout(panelPx: number, isCollapsed: boolean) {
    return {
        top: `${HISTORY_OVERLAY_EDGE_PX}px`,
        bottom: `${isCollapsed ? HISTORY_OVERLAY_EDGE_PX : panelPx + HISTORY_OVERLAY_EDGE_PX}px`,
    };
}

function filterHistoryEntriesByMinimumGap(
    history: MachinePositionHistoryEntry[],
    minimumGapMs: number,
) {
    if (history.length <= 2 || minimumGapMs <= 0) {
        return history;
    }

    const filtered: MachinePositionHistoryEntry[] = [];
    let lastIncludedTimeMs: number | null = null;

    history.forEach((entry, index) => {
        const isFirst = index === 0;
        const isLast = index === history.length - 1;
        const timestampMs = toHistoryTimestampMs(entry.reported_at);

        if (isFirst || isLast || timestampMs == null || lastIncludedTimeMs == null) {
            filtered.push(entry);
            if (timestampMs != null) {
                lastIncludedTimeMs = timestampMs;
            }
            return;
        }

        if (timestampMs - lastIncludedTimeMs >= minimumGapMs) {
            filtered.push(entry);
            lastIncludedTimeMs = timestampMs;
        }
    });

    return filtered;
}

function formatHistoryFilterTimestamp(value?: string | null) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return `${formatDatePart(date)}\nkl. ${formatTimePart(date)}`;
}

function formatDatePart(date: Date) {
    return date.toLocaleDateString("nb-NO", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
    });
}

function formatTimePart(date: Date) {
    return date.toLocaleTimeString("nb-NO", {
        hour: "2-digit",
        minute: "2-digit",
    });
}

function toHistoryTimestampMs(value?: string | number | null) {
    if (!value) return null;
    const timestampMs = new Date(value).getTime();
    return Number.isNaN(timestampMs) ? null : timestampMs;
}

function toTitleCase(value: string) {
    return value
        .split(/\s+/)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(" ");
}

function fitToFeatures(map: Map, fc: MachinesFC, opts?: { onlyIfChanged?: boolean }) {
    const feats = fc.features ?? [];
    if (feats.length === 0) return;

    const key = feats.map((f) => String((f.properties as any)?.id ?? "")).join("|") + `:${feats.length}`;
    const mapAny = map as any;
    if (opts?.onlyIfChanged && mapAny.__lastFitKey === key) return;

    const first = feats[0].geometry as Point;
    const bounds = feats.reduce(
        (b, f) => b.extend((f.geometry as Point).coordinates as [number, number]),
        new maplibregl.LngLatBounds(first.coordinates as [number, number], first.coordinates as [number, number])
    );

    map.easeTo({ duration: 400 });
    map.fitBounds(bounds, { padding: 60, maxZoom: 13.5, duration: 400 });
    (map as any).__lastFitKey = key;
}

function fitMapToCoordinates(map: Map, coordinates: [number, number][]) {
    if (!coordinates.length) return;

    const [firstLng, firstLat] = coordinates[0];
    const bounds = coordinates.reduce(
        (acc, [lng, lat]) => acc.extend([lng, lat]),
        new maplibregl.LngLatBounds([firstLng, firstLat], [firstLng, firstLat]),
    );

    map.easeTo({ duration: 400 });
    map.fitBounds(bounds, { padding: 80, maxZoom: 15, duration: 400 });
}

function applyLabelContrast(map: Map, theme: "light" | "dark") {
    const isDark = theme === "dark";

    const textColor = isDark ? "#FFFFFF" : "#111827";
    const haloColor = isDark ? "rgba(0,0,0,0.85)" : c.grayStroke;
    const haloWidth = isDark ? 2.25 : 1.5;
    const haloBlur = isDark ? 0.4 : 0.1;

    if (map.getLayer("unclustered-label")) {
        map.setPaintProperty("unclustered-label", "text-color", textColor);
        map.setPaintProperty("unclustered-label", "text-halo-color", haloColor);
        map.setPaintProperty("unclustered-label", "text-halo-width", haloWidth);
        map.setPaintProperty("unclustered-label", "text-halo-blur", haloBlur);
    }

    if (map.getLayer("cluster-count")) {
        map.setPaintProperty("cluster-count", "text-color", textColor);
        map.setPaintProperty("cluster-count", "text-halo-color", haloColor);
        map.setPaintProperty("cluster-count", "text-halo-width", haloWidth);
        map.setPaintProperty("cluster-count", "text-halo-blur", haloBlur);
    }

    if (map.getLayer("unclustered-point")) {
        map.setPaintProperty("unclustered-point", "circle-stroke-color", isDark ? "#FFFFFF" : c.grayStroke);
        map.setPaintProperty("unclustered-point", "circle-color", isDark ? OEM_COLOR_EXPRESSION : OEM_COLOR_EXPRESSION);
    }
}

function cloneStyle(style: StyleSpecification) {
    return JSON.parse(JSON.stringify(style)) as StyleSpecification;
}

function emptyHistoryFeatureCollection(): HistoryFeatureCollection {
    return { type: "FeatureCollection", features: [] };
}

function buildHistoryFeatureCollection(
    history: MachinePositionHistoryEntry[],
    selectedHistoryEntryId: string | null,
    currentHistoryEntryId: string | null,
): HistoryFeatureCollection {
    if (!history.length) return emptyHistoryFeatureCollection();

    const pointFeatures = history.map((entry) => ({
        type: "Feature" as const,
        geometry: {
            type: "Point" as const,
            coordinates: [entry.lng, entry.lat],
        },
        properties: {
            kind: "point" as const,
            reported_at: entry.reported_at,
            history_id: entry.id,
            selected: entry.id === selectedHistoryEntryId,
            is_current: entry.id === currentHistoryEntryId,
        },
    }));

    const lineFeature = {
        type: "Feature" as const,
        geometry: {
            type: "LineString" as const,
            coordinates: history.map((entry) => [entry.lng, entry.lat] as [number, number]),
        },
        properties: {
            kind: "line" as const,
        },
    };

    return {
        type: "FeatureCollection",
        features: history.length > 1 ? [...pointFeatures, lineFeature] : pointFeatures,
    };
}

function addMachinesToStyle(style: StyleSpecification, data: MachinesFC) {
    style.sources = style.sources ?? {};

    const sourceSpec: GeoJSONSourceSpecification = {
        type: "geojson",
        data,
        cluster: true,
        clusterRadius: 50,
        clusterMaxZoom: 12,
    };

    if (!style.sources["machines"]) {
        style.sources["machines"] = sourceSpec;
    } else {
        const src = style.sources["machines"] as GeoJSONSourceSpecification;
        src.type = "geojson";
        src.data = data;
        src.cluster = true;
        src.clusterRadius = 50;
        src.clusterMaxZoom = 12;
    }

    style.layers = style.layers ?? [];
    const existing = new Set(style.layers.map((layer) => layer.id));

    const layersToAdd = [
        {
            id: "clusters",
            type: "circle",
            source: "machines",
            filter: ["has", "point_count"],
            paint: {
                "circle-color": ["step", ["get", "point_count"], c.cluster1, 10, c.cluster2, 25, c.cluster3],
                "circle-radius": ["step", ["get", "point_count"], 14, 10, 18, 25, 24],
                "circle-stroke-color": c.grayStroke,
                "circle-stroke-width": 1.25,
            },
        },
        {
            id: "cluster-count",
            type: "symbol",
            source: "machines",
            filter: ["has", "point_count"],
            layout: {
                "text-field": ["get", "point_count_abbreviated"],
                "text-size": 12,
            },
            paint: { "text-halo-width": 1, "text-halo-color": c.grayStroke },
        },
        {
            id: "unclustered-point",
            type: "circle",
            source: "machines",
            filter: ["!", ["has", "point_count"]],
            paint: {
                "circle-color": OEM_COLOR_EXPRESSION,
                "circle-radius": 6,
                "circle-stroke-width": 1.5,
                "circle-stroke-color": c.grayStroke,
            },
        },
        {
            id: "unclustered-label",
            type: "symbol",
            source: "machines",
            filter: ["!", ["has", "point_count"]],
            layout: {
                "text-field": ["get", "name"],
                "text-size": 11,
                "text-offset": [0, 1.0],
                "text-anchor": "top",
            },
            paint: { "text-halo-width": 1, "text-halo-color": c.grayStroke },
        },
    ] as LayerSpecification[];

    for (const layer of layersToAdd) {
        if (!existing.has(layer.id)) style.layers.push(layer);
    }
}

function addHistoryToStyle(style: StyleSpecification, data: HistoryFeatureCollection, color: string) {
    style.sources = style.sources ?? {};

    const sourceSpec: GeoJSONSourceSpecification = {
        type: "geojson",
        data,
    };

    if (!style.sources["machine-history"]) {
        style.sources["machine-history"] = sourceSpec;
    } else {
        const src = style.sources["machine-history"] as GeoJSONSourceSpecification;
        src.type = "geojson";
        src.data = data;
    }

    style.layers = style.layers ?? [];
    const existing = new Set(style.layers.map((layer) => layer.id));

    const layersToAdd = [
        {
            id: "machine-history-line",
            type: "line",
            source: "machine-history",
            filter: ["==", ["geometry-type"], "LineString"],
            paint: {
                "line-color": color,
                "line-width": 3,
                "line-opacity": 0.75,
            },
        },
        {
            id: "machine-history-point",
            type: "circle",
            source: "machine-history",
            filter: ["==", ["geometry-type"], "Point"],
            paint: {
                "circle-color": "#ffffff",
                "circle-radius": 4,
                "circle-stroke-color": color,
                "circle-stroke-width": 2,
            },
        },
        {
            id: "machine-history-selected",
            type: "circle",
            source: "machine-history",
            filter: ["all", ["==", ["geometry-type"], "Point"], ["==", ["get", "selected"], true]],
            paint: {
                "circle-radius": 8,
                "circle-color": "rgba(34, 197, 94, 0.18)",
                "circle-stroke-color": "#22C55E",
                "circle-stroke-width": 2,
            },
        },
        {
            id: "machine-history-selected-inner",
            type: "circle",
            source: "machine-history",
            filter: ["all", ["==", ["geometry-type"], "Point"], ["==", ["get", "selected"], true]],
            paint: {
                "circle-radius": 2.5,
                "circle-color": "#22C55E",
            },
        },
    ] as LayerSpecification[];

    for (const layer of layersToAdd) {
        if (!existing.has(layer.id)) style.layers.push(layer);
    }
}

function applyVisibilityToStyle(
    style: StyleSpecification,
    opts: { labels: boolean; roads: boolean; borders: boolean }
) {
    const layers = style.layers ?? [];
    for (const layer of layers) {
        const source = "source" in layer ? layer.source : undefined;
        if (source === "machines") continue;

        const id = String(layer.id ?? "");
        const sourceLayer = String((layer as any)["source-layer"] ?? "");

        const isLabel = layer.type === "symbol" && (layer.layout as any)?.["text-field"];
        const isRoad = /road|transportation/i.test(id) || /road|transportation/i.test(sourceLayer);
        const isBorder = /boundary|border|admin/i.test(id) || /boundary|border|admin/i.test(sourceLayer);

        if (!isLabel && !isRoad && !isBorder) continue;

        const shouldShow =
            (isLabel ? opts.labels : true) &&
            (isRoad ? opts.roads : true) &&
            (isBorder ? opts.borders : true);

        layer.layout = layer.layout ?? {};
        (layer.layout as any).visibility = shouldShow ? "visible" : "none";
    }
}

function escapeHtml(s: string) {
    const m: Record<string, string> = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
    };
    return s.replace(/[&<>"']/g, (ch) => m[ch]);
}

function formatPopupValue(value?: string | number | null) {
    if (value === null || value === undefined) return "-";
    const text = String(value).trim();
    return text.length ? text : "-";
}

function buildPopupContent({
    id,
    name,
    oemName,
    logoSrc,
    categoryValue,
    activeAgreementId,
    renterValue,
    lastSeenValue,
}: {
    id: string;
    name: string;
    oemName: string;
    logoSrc?: string | null;
    categoryValue: string;
    activeAgreementId?: string | null;
    renterValue: string;
    lastSeenValue: string;
}) {
    const container = document.createElement("div");
    const categoryTone = categoryValue === "-" ? "text-slate-400 font-medium" : "text-slate-900 font-semibold";
    const renterTone = renterValue === "-" ? "text-slate-400 font-medium" : "text-slate-900 font-semibold";
    const lastSeenTone = lastSeenValue === "-" ? "text-slate-400 font-medium" : "text-slate-900 font-semibold";
    const agreementMarkup = activeAgreementId
        ? `
            <button
                type="button"
                data-open-agreement
                class="inline-flex max-w-full cursor-pointer items-center rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-800 transition hover:border-blue-300 hover:bg-blue-100"
            >
                <span class="truncate">${escapeHtml(activeAgreementId)}</span>
            </button>
        `
        : `<div class="mt-0.5 text-[11px] font-medium text-slate-400">-</div>`;
    const logoMarkup = logoSrc
        ? `<img src="${escapeHtml(logoSrc)}" alt="${escapeHtml(oemName)} logo" class="max-h-8 w-auto object-contain" />`
        : `<span class="text-[10px] font-semibold text-slate-400">OEM</span>`;

    container.className = "min-w-[260px] max-w-[320px]";
    container.innerHTML = `
        <div class="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
            <div class="flex items-start justify-between gap-2 border-b border-slate-100 px-2.5 py-2">
                <div class="flex min-w-0 items-stretch gap-2">
                    <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white p-0.5">
                        ${logoMarkup}
                    </div>
                    <div class="min-w-0">
                        <div class="truncate text-[13px] font-semibold text-slate-900">${escapeHtml(name)}</div>
                        <div class="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                            ID: ${escapeHtml(id)}
                        </div>
                    </div>
                </div>
                <button
                    type="button"
                    data-popup-close
                    class="cursor-pointer rounded-full p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                    aria-label="Lukk"
                >
                    <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M18 6L6 18M6 6l12 12" stroke-linecap="round" stroke-linejoin="round"></path>
                    </svg>
                </button>
            </div>
            <div class="space-y-2 px-2.5 py-2.5">
                <div class="grid grid-cols-2 gap-1.5">
                    <div class="min-h-[52px] rounded-lg border border-slate-100 bg-slate-50 px-2 py-1.5">
                        <div class="text-[9px] font-semibold uppercase tracking-wide text-slate-500">Kategori</div>
                        <div class="mt-0.5 text-[11px] ${categoryTone}">${escapeHtml(categoryValue)}</div>
                    </div>
                    <div class="min-h-[52px] rounded-lg border border-slate-100 bg-slate-50 px-2 py-1.5">
                        <div class="text-[9px] font-semibold uppercase tracking-wide text-slate-500">Aktiv avtale</div>
                        <div class="mt-0.5">
                            ${agreementMarkup}
                        </div>
                    </div>
                    <div class="min-h-[52px] rounded-lg border border-slate-100 bg-slate-50 px-2 py-1.5">
                        <div class="text-[9px] font-semibold uppercase tracking-wide text-slate-500">Leietaker</div>
                        <div class="mt-0.5 text-[11px] ${renterTone}">${escapeHtml(renterValue)}</div>
                    </div>
                    <div class="min-h-[52px] rounded-lg border border-slate-100 bg-slate-50 px-2 py-1.5">
                        <div class="text-[9px] font-semibold uppercase tracking-wide text-slate-500">Sist sett</div>
                        <div class="mt-0.5 text-[11px] ${lastSeenTone}">${escapeHtml(lastSeenValue)}</div>
                    </div>
                </div>
                <button
                    type="button"
                    data-show-history
                    class="${standardButtonCompactClass.replace("text-sm", "text-[11px]")} w-full"
                >
                    ${SHOW_HISTORY_LABEL}
                </button>
                <button
                    type="button"
                    data-show-details
                    class="${standardButtonCompactClass.replace("text-sm", "text-[11px]")} w-full"
                >
                    Vis detaljer
                </button>
            </div>
        </div>
    `;

    return container;
}

function setPopupActionsDisabled(container: HTMLElement, disabled: boolean) {
    const selectors = ["[data-popup-close]", "[data-show-details]", "[data-open-agreement]"];
    selectors.forEach((selector) => {
        const button = container.querySelector<HTMLButtonElement>(selector);
        if (!button) return;

        button.disabled = disabled;
        button.setAttribute("aria-disabled", disabled ? "true" : "false");
        button.style.opacity = disabled ? "0.55" : "";
        button.style.cursor = disabled ? "not-allowed" : "";
    });
}

function setHistoryButtonLoading(button: HTMLButtonElement) {
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    button.innerHTML = `
        <span class="inline-flex items-center gap-2">
            <svg class="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="3" opacity="0.25"></circle>
                <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" stroke-width="3" stroke-linecap="round"></path>
            </svg>
            <span>Laster bevegelser...</span>
        </span>
    `;
}

function setHistoryButtonLabel(button: HTMLButtonElement, label: string) {
    button.disabled = false;
    button.removeAttribute("aria-busy");
    button.textContent = label;
}

function resetHistoryButton(button: HTMLButtonElement, delayMs = 2200) {
    window.setTimeout(() => {
        if (!button.isConnected) return;
        setHistoryButtonLabel(button, SHOW_HISTORY_LABEL);
    }, delayMs);
}

function formatLastUpdated(v: string | number) {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return String(v);
    return d.toLocaleString("nb-NO", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function formatDurationBetween(from: string | number | undefined, to: string | number | undefined) {
    if (!from || !to) return "-";

    const fromMs = new Date(from).getTime();
    const toMs = new Date(to).getTime();
    if (Number.isNaN(fromMs) || Number.isNaN(toMs)) return "-";

    const diffMs = Math.abs(toMs - fromMs);
    const totalMinutes = Math.round(diffMs / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours <= 0) return `${minutes} min`;
    if (minutes === 0) return `${hours} t`;
    return `${hours} t ${minutes} min`;
}
