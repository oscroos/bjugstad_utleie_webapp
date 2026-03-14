"use client";

import dynamic from "next/dynamic";
import KartLoadingShell from "./KartLoadingShell";

const Map = dynamic(() => import("./Map"), {
    ssr: false,
    loading: () => <KartLoadingShell />,
});

export default function MapClient() {
    return <Map />;
}
