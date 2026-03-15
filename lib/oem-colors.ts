export const OEM_COLORS = {
    hydrema: "#000000",
    cat: "#F59E0B",
    volvo: "#0c3797",
    john_deere: "#387c2c",
    avant: "#ed1c24",
    can_am: "#fecd20",
    massey_ferguson: "#e20613",
    liebherr: "#000000",
    huddig: "#ee291c",
    default: "#898989",
} as const;

export const OEM_COLOR_ALIASES: Record<string, keyof typeof OEM_COLORS> = {
    hydrema: "hydrema",
    cat: "cat",
    caterpillar: "cat",
    volvo: "volvo",
    "volvo ce": "volvo",
    "john deere": "john_deere",
    johndeere: "john_deere",
    john_deere: "john_deere",
    avant: "avant",
    "can am": "can_am",
    "can-am": "can_am",
    brp: "can_am",
    "massey ferguson": "massey_ferguson",
    "massey-ferguson": "massey_ferguson",
    liebherr: "liebherr",
    huddig: "huddig",
};

export function normalizeOemColorKey(oemName: string | null | undefined) {
    const normalized = String(oemName ?? "")
        .trim()
        .toLowerCase()
        .replace(/[-_]+/g, " ")
        .replace(/\s+/g, " ");

    return OEM_COLOR_ALIASES[normalized] ?? "default";
}

export function getOemColor(oemName: string | null | undefined) {
    return OEM_COLORS[normalizeOemColorKey(oemName)];
}

export function getOemColorMatchEntries() {
    return Object.entries(OEM_COLOR_ALIASES).flatMap(([alias, key]) => [alias, OEM_COLORS[key]]);
}
