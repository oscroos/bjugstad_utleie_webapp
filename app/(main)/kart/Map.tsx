// app/(main)/kart/Map.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import DataTable, { type DataColumn } from "@/components/DataTable";
import { useMachines, useMachinesList } from "@/components/MachinesContext";
import type {
    MachineFeature,
    MachineListEntry,
    MachinesFC,
    MachinePositionHistoryEntry,
    MachineProps,
} from "@/types/machines";
import Image from "next/image";
import { getOEMLogo } from "@/lib/get_OEM_logo";

type Props = { features?: MachinesFC };
type HistoryFeatureCollection = FeatureCollection<Geometry, { kind: "point" | "line"; reported_at?: string }>;

const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY;

// Palette
const c = {
    blue: "#3B82F6",
    blueDark: "#1D4ED8",
    grayStroke: "#F8FAFC",
    cluster1: "#D9E2EC",
    cluster2: "#9FB3C8",
    cluster3: "#486581",
};

const OEM_COLORS: Record<string, string> = {
    hydrema: "#000000", // black
    cat: "#F59E0B",     // orange/amber
    default: c.blue,    // fallback
};

function buildOemColorExpression(): any[] {
    // ["match", ["downcase", ["coalesce", ["get","oem_name"], ""]], "hydrema","#000", "cat","#F59E0B", fallback]
    const entries: any[] = [];
    for (const [k, v] of Object.entries(OEM_COLORS)) {
        if (k === "default") continue;
        entries.push(k, v);
    }
    return ["match", ["downcase", ["coalesce", ["get", "oem_name"], ""]], ...entries, OEM_COLORS.default];
}

const OEM_COLOR_EXPRESSION = ([
    "match",
    ["downcase", ["coalesce", ["to-string", ["get", "oem_name"]], ""]],
    "hydrema", OEM_COLORS.hydrema,
    "cat", OEM_COLORS.cat,
    OEM_COLORS.default,
] as unknown) as maplibregl.ExpressionSpecification;

export default function MapView({ features }: Props) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const mapRef = useRef<Map | null>(null);
    const loadedRef = useRef(false);
    const appliedThemeRef = useRef<"light" | "dark">("light");
    const themeRef = useRef<"light" | "dark">("light");
    const styleCacheRef = useRef<{ light?: StyleSpecification; dark?: StyleSpecification }>({});

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
    const historyDataRef = useRef<HistoryFeatureCollection>(emptyHistoryFeatureCollection());
    const historyMachineIdRef = useRef<string | null>(null);
    const historyColorRef = useRef<string>(OEM_COLORS.default);

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
            id: "type",
            header: "Type",
            accessor: () => "",
            cell: () => <span className="text-slate-400">-</span>,
            sortValue: () => "",
            filterValue: () => "-",
            cellClassName: "text-slate-400 align-middle",
        },
        {
            id: "activeAgreement",
            header: "Aktiv avtale",
            accessor: () => "",
            cell: () => <span className="text-slate-400">-</span>,
            sortValue: () => "",
            filterValue: () => "-",
            cellClassName: "text-slate-400 align-middle",
        },
        {
            id: "renter",
            header: "Leietaker",
            accessor: () => "",
            cell: () => <span className="text-slate-400">-</span>,
            sortValue: () => "",
            filterValue: () => "-",
            cellClassName: "text-slate-400 align-middle",
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
                    "circle-color": "#ffffff",
                    "circle-radius": 4,
                    "circle-stroke-color": color,
                    "circle-stroke-width": 2,
                },
            });
        } else {
            map.setPaintProperty("machine-history-point", "circle-stroke-color", color);
        }
    }

    function clearMachineHistory(map?: Map | null) {
        historyMachineIdRef.current = null;
        historyDataRef.current = emptyHistoryFeatureCollection();
        historyColorRef.current = OEM_COLORS.default;
        setHistoryEntries([]);
        setHistoryMachineName(null);
        setHistoryColor(OEM_COLORS.default);

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
        button: HTMLButtonElement,
    ) {
        if (historyMachineIdRef.current && historyMachineIdRef.current !== machineId) {
            clearMachineHistory(map);
        }

        button.disabled = true;
        button.textContent = "Laster...";

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
            const fc = buildHistoryFeatureCollection(history);

            historyMachineIdRef.current = machineId;
            historyDataRef.current = fc;
            historyColorRef.current = getHistoryColor(oemName);
            setHistoryEntries(history);
            setHistoryMachineName(machineName);
            setHistoryColor(historyColorRef.current);
            ensureHistoryLayers(map, fc, historyColorRef.current);
            bringMachineLayersToTop(map);

            if (history.length) {
                fitMapToCoordinates(
                    map,
                    history.map((entry) => [entry.lng, entry.lat] as [number, number]),
                );
                button.textContent = "Viser siste bevegelser";
            } else {
                button.textContent = "Ingen bevegelser funnet";
            }
        } catch (error) {
            console.error("Failed to load machine history", error);
            clearMachineHistory(map);
            button.textContent = "Kunne ikke hente bevegelser";
        } finally {
            button.disabled = false;
        }
    }

    // add near other refs
    const popupRef = useRef<maplibregl.Popup | null>(null);

    function openPopupForFeature(map: Map, f: MachineFeature, opts?: { sticky?: boolean }) {
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
        const logoSrc = getOEMLogo(oemName);
        const typeValue = formatPopupValue("");
        const agreementStatus = "-";
        const renterValue = formatPopupValue("");
        const lastSeenValue = formatPopupValue(
            props.last_pos_reported_at ? formatLastUpdated(props.last_pos_reported_at) : "",
        );

        const popupContent = buildPopupContent({
            id: String(id),
            name,
            oemName,
            logoSrc,
            typeValue,
            agreementStatus,
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
            popup.remove();
            void loadMachineHistory(
                String(id),
                name,
                oemName,
                map,
                popupContent.querySelector<HTMLButtonElement>("[data-show-history]")!,
            );
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
        const map = mapRef.current;
        if (!map) return;
        const f = safeFeatures.features.find((x) => String(x.properties?.id) === String(id));
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

        // Cursor
        map.on("mouseenter", "clusters", () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", "clusters", () => (map.getCanvas().style.cursor = ""));
        map.on("mouseenter", "unclustered-point", () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", "unclustered-point", () => (map.getCanvas().style.cursor = ""));

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
            ensureDataLayers(map, safeFeatures);
            ensureHistoryLayers(map, historyDataRef.current, historyColorRef.current);
            reapplyAllVisibilities(map);
            applyLabelContrast(map, theme);
            bringMachineLayersToTop(map);
            ensureInteractions(map);
            fitToFeatures(map, safeFeatures);
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
            addMachinesToStyle(nextStyle, safeFeatures);
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
                ensureDataLayers(stableMap, safeFeatures);
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
    }, [theme, safeFeatures]);

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
            src.setData(safeFeatures);
            fitToFeatures(map, safeFeatures, { onlyIfChanged: true });
        }
    }, [safeFeatures]);

    // ---------- bottom panel size/collapse with click-or-drag divider ----------
    const [panelPx, setPanelPx] = useState<number>(280);
    const [isCollapsed, setIsCollapsed] = useState(false);
    const draggingRef = useRef(false);
    const dragStartYRef = useRef(0);
    const panelStartRef = useRef(panelPx);
    const movedRef = useRef(false);
    const lastNonZeroRef = useRef(280);
    const CLICK_THRESHOLD_PX = 5;

    useEffect(() => {
        function onMove(e: MouseEvent) {
            if (!draggingRef.current) return;
            const dy = dragStartYRef.current - e.clientY;
            if (Math.abs(dy) > CLICK_THRESHOLD_PX) movedRef.current = true;
            const next = Math.max(0, panelStartRef.current + dy);
            setPanelPx(next);
            if (next > 0) {
                lastNonZeroRef.current = next;
                if (isCollapsed) setIsCollapsed(false);
            } else {
                setIsCollapsed(true);
            }
            mapRef.current?.resize();
        }
        function onUp() {
            if (!draggingRef.current) return;
            draggingRef.current = false;
            // If mouse didn't move → treat as click toggle
            if (!movedRef.current) {
                if (isCollapsed) {
                    const h = Math.max(120, lastNonZeroRef.current || 280);
                    setPanelPx(h);
                    setIsCollapsed(false);
                } else {
                    setIsCollapsed(true);
                    setPanelPx(0);
                }
                setTimeout(() => mapRef.current?.resize(), 170);
            }
        }
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
        return () => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
        };
    }, [isCollapsed]);

    const mapHeightStyle = isCollapsed ? { height: "100vh" } : { height: `calc(100vh - ${panelPx}px)` };
    const historyOverlayStyle = {
        top: isCollapsed ? "50vh" : `calc((100vh - ${panelPx}px) / 2)`,
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
            <div ref={containerRef} className="w-full" style={mapHeightStyle} />

            {historyEntries.length > 0 ? (
                <div
                    className="pointer-events-none absolute right-3 z-10 w-[min(16rem,calc(100vw-1.5rem))] -translate-y-1/2"
                    style={historyOverlayStyle}
                >
                    <div className="pointer-events-auto overflow-hidden rounded-2xl border border-slate-200 bg-white/95 shadow-xl backdrop-blur">
                        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
                            <div className="min-w-0">
                                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                                    Siste bevegelser
                                </div>
                                <div className="truncate text-sm font-semibold text-slate-900">
                                    {historyMachineName ?? "Maskin"}
                                </div>
                                <div className="text-xs text-slate-500">
                                    {historyEntries.length} posisjoner
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => clearMachineHistory()}
                                className="rounded-full p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                                aria-label="Lukk historikk"
                                title="Lukk historikk"
                            >
                                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            </button>
                        </div>
                        <div className="max-h-[min(42vh,24rem)] overflow-auto px-3 py-3">
                            <div className="relative">
                                {historyEntries.length > 1 ? (
                                    <div
                                        className="absolute bottom-4 left-4 top-4 w-px"
                                        style={{ backgroundColor: historyColor }}
                                    />
                                ) : null}
                                <div className="space-y-0.5">
                                    {historyEntries.map((entry, index) => (
                                        <div key={entry.id} className="relative pl-11 pr-1 py-1.5">
                                            <div className="absolute left-1 top-1.5 flex w-6 justify-center">
                                                <div
                                                    className="h-3 w-3 rounded-full border-2 bg-white shadow-sm"
                                                    style={{
                                                        borderColor: historyColor,
                                                        backgroundColor:
                                                            index === historyEntries.length - 1 ? historyColor : "#ffffff",
                                                    }}
                                                />
                                            </div>
                                            <div className="min-w-0">
                                                <div className="text-sm font-semibold leading-tight text-slate-900">
                                                    {formatLastUpdated(entry.reported_at)}
                                                </div>
                                                {index < historyEntries.length - 1 ? (
                                                    <div className="pt-2 text-[11px] font-medium leading-none text-slate-400">
                                                        {formatDurationBetween(
                                                            entry.reported_at,
                                                            historyEntries[index + 1]?.reported_at,
                                                        )}
                                                    </div>
                                                ) : null}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}

            {/* Divider (click = toggle, drag = resize) - SHORTER HEIGHT */}
            <div
                className="relative z-10 h-1.5 w-full cursor-row-resize bg-gradient-to-b from-transparent to-transparent hover:from-slate-200/60 hover:to-transparent"
                onMouseDown={(e) => {
                    draggingRef.current = true;
                    dragStartYRef.current = e.clientY;
                    panelStartRef.current = panelPx;
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
                className={`w-full border-t border-slate-200 bg-white transition-[height] duration-150 ${isCollapsed ? "h-0 overflow-hidden" : "overflow-hidden"
                    }`}
                style={{ height: isCollapsed ? 0 : panelPx }}
            >
                <div className="h-full overflow-auto">
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
                    />
                </div>
            </div>
        </div>
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


// ---------- HELPER FUNCTIONS ----------

function hasMachineCoords(machine: MachineListEntry) {
    return Number.isFinite(machine.lng) && Number.isFinite(machine.lat);
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

function getHistoryColor(oemName: string | null | undefined) {
    const normalized = String(oemName ?? "").trim().toLowerCase();
    return OEM_COLORS[normalized] ?? OEM_COLORS.default;
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

function buildHistoryFeatureCollection(history: MachinePositionHistoryEntry[]): HistoryFeatureCollection {
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
    typeValue,
    agreementStatus,
    renterValue,
    lastSeenValue,
}: {
    id: string;
    name: string;
    oemName: string;
    logoSrc?: string | null;
    typeValue: string;
    agreementStatus: string;
    renterValue: string;
    lastSeenValue: string;
}) {
    const container = document.createElement("div");
    const statusTone =
        agreementStatus === "Aktiv"
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : "border-slate-200 bg-slate-100 text-slate-600";
    const typeTone = typeValue === "-" ? "text-slate-400 font-medium" : "text-slate-900 font-semibold";
    const renterTone = renterValue === "-" ? "text-slate-400 font-medium" : "text-slate-900 font-semibold";
    const lastSeenTone = lastSeenValue === "-" ? "text-slate-400 font-medium" : "text-slate-900 font-semibold";
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
                        <div class="text-[9px] font-semibold uppercase tracking-wide text-slate-500">Type</div>
                        <div class="mt-0.5 text-[11px] ${typeTone}">${escapeHtml(typeValue)}</div>
                    </div>
                    <div class="min-h-[52px] rounded-lg border border-slate-100 bg-slate-50 px-2 py-1.5">
                        <div class="text-[9px] font-semibold uppercase tracking-wide text-slate-500">Avtale</div>
                        <div class="mt-0.5">
                            <span class="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusTone}">
                                ${escapeHtml(agreementStatus)}
                            </span>
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
                    class="w-full cursor-pointer rounded-lg bg-slate-900 px-3 py-2 text-[11px] font-semibold text-white transition hover:bg-slate-800 disabled:cursor-default disabled:bg-slate-300"
                >
                    Se siste bevegelser
                </button>
            </div>
        </div>
    `;

    return container;
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

    const diffMs = Math.max(0, toMs - fromMs);
    const totalMinutes = Math.round(diffMs / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours <= 0) return `${minutes} min`;
    if (minutes === 0) return `${hours} t`;
    return `${hours} t ${minutes} min`;
}
