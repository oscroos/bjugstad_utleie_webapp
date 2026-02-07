// app/(main)/kart/Map.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Point } from "geojson";
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
import type { MachineFeature, MachineListEntry, MachinesFC } from "@/types/machines";
import Image from "next/image";
import { getOEMLogo } from "@/lib/get_OEM_logo";

type Props = { features?: MachinesFC };

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

    // add near other refs
    const popupRef = useRef<maplibregl.Popup | null>(null);

    function openPopupForFeature(map: Map, f: MachineFeature, opts?: { sticky?: boolean }) {
        // close existing popup
        if (popupRef.current) {
            try { popupRef.current.remove(); } catch { }
            popupRef.current = null;
        }

        const coords = (f.geometry as Point).coordinates.slice() as [number, number];
        const { id, name } = (f.properties ?? {}) as { id?: string | number; name?: string };
        const html = `
    <div style="min-width:200px; font: 13px/1.4 system-ui, -apple-system, Segoe UI, Roboto;">
      <div style="font-weight:600; margin-bottom:2px;">${escapeHtml(name ?? "Maskin")}</div>
      <div style="color:#374151;">ID: ${escapeHtml(String(id ?? "-"))}</div>
      <div style="color:#6B7280; margin-top:2px;">${coords[1].toFixed(5)}, ${coords[0].toFixed(5)}</div>
    </div>
  `;

        const popup = new maplibregl.Popup({ closeOnMove: !(opts?.sticky), offset: 12 })
            .setLngLat(coords)
            .setHTML(html)
            .addTo(map);

        popup.on("close", () => {
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
