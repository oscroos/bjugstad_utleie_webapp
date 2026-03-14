export default function KartLoadingShell() {
    return (
        <div className="flex h-screen w-full flex-col bg-slate-100">
            <div className="relative flex-1 overflow-hidden bg-slate-200">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(148,163,184,0.22),_transparent_48%)]" />
                <div className="absolute left-3 top-3 flex flex-col gap-2">
                    <div className="h-11 w-28 rounded-full border border-slate-300 bg-white/90 shadow-sm" />
                    <div className="h-11 w-28 rounded-full border border-slate-300 bg-white/80 shadow-sm" />
                    <div className="h-11 w-28 rounded-full border border-slate-300 bg-white/70 shadow-sm" />
                    <div className="h-11 w-28 rounded-full border border-slate-300 bg-white/60 shadow-sm" />
                </div>
                <div className="absolute inset-0 flex items-center justify-center">
                    <div className="rounded-2xl border border-slate-200 bg-white/90 px-5 py-3 text-sm font-medium text-slate-600 shadow-sm">
                        Laster kart...
                    </div>
                </div>
            </div>

            <div className="h-1.5 w-full bg-slate-300" />

            <div className="h-[320px] border-t border-slate-200 bg-white">
                <div className="flex h-14 items-center border-b border-slate-200 px-4">
                    <div className="h-4 w-32 rounded bg-slate-200" />
                </div>
                <div className="space-y-3 p-4">
                    <div className="h-12 rounded-xl bg-slate-100" />
                    <div className="h-12 rounded-xl bg-slate-100" />
                    <div className="h-12 rounded-xl bg-slate-100" />
                    <div className="h-12 rounded-xl bg-slate-100" />
                </div>
            </div>
        </div>
    );
}
