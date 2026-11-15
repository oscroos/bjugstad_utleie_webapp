import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { spoerFlaaten } from "@/lib/ai/flaate";
import { checkAiQuota, recordAiUsage } from "@/lib/sikkerhet/guard";

// POST /api/flaate-ai  { question, historikk? }
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.organizationId) return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
  const b = await req.json();
  if (!b.question?.trim()) return NextResponse.json({ error: "Mangler spørsmål." }, { status: 400 });
  const quota = await checkAiQuota(session.user.organizationId, "FLAATE_AI");
  if (!quota.ok) return NextResponse.json({ error: "AI-kvoten for i dag er brukt opp." }, { status: 429 });
  const svar = await spoerFlaaten({
    question: b.question.trim(),
    organizationId: session.user.organizationId,
    historikk: Array.isArray(b.historikk) ? b.historikk.slice(-10) : [],
  });
  await recordAiUsage(session.user.organizationId, "FLAATE_AI");
  return NextResponse.json({ svar });
}
