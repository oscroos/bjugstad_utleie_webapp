import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import MiljoDashboard from "@/components/miljo/MiljoDashboard";

// Org-nivå: hele selskapet, med dimensjonsvalg i dashboardet.
export default async function MiljoSide() {
  const session = await auth();
  if (!session?.user?.organizationId) redirect("/login");

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <h1 className="text-2xl font-semibold text-slate-900">CO2-/miljøregnskap</h1>
      <p className="mb-6 text-sm text-slate-500">
        Utslipp fra maskiner og massetransport – filtrer på egne, leide, UE eller alle.
      </p>
      <MiljoDashboard />
    </div>
  );
}
