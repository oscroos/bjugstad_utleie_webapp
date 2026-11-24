import { RouteSkeleton } from "@/components/PageSkeleton";

// Shown while the server renders the page. Same placeholder as the one AppShell
// shows the moment the sidebar tab is clicked.
export default function AktivitetLoading() {
  return <RouteSkeleton href="/aktivitet" />;
}
