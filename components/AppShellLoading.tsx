import Spinner from "@/components/Spinner";

export default function AppShellLoading() {
  return (
    <main className="md:ml-56 min-h-screen grid place-items-center">
      <Spinner label="Laster side..." />
    </main>
  );
}
