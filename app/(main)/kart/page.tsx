// app/(main)/kart/page.tsx
export const revalidate = 0; // page itself doesn't fetch; let provider control caching

import Map from "./Map";

export default function KartPage() {
    return <Map />; // no props -> Map will read context
}
