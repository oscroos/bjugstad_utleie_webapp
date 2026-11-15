import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { nesteForfall, klassifiser } from "@/lib/rapportering/scheduling";
import type { ReportInterval } from "@/lib/types";

// ────────────────────────────────────────────────────────────────────────────
//  CRON: daglig forfallskjøring
//
//  Oppsett (vercel.json):
//    { "crons": [{ "path": "/api/cron/forfall", "schedule": "0 5 * * *" }] }
//
//  Sikres med CRON_SECRET i env – Vercel sender Authorization: Bearer <secret>.
//
//  Gjør tre ting:
//  1) Setter Report.status = OVERDUE der dueDate er passert
//  2) Beregner neste forfall per aktivt krav og oppdaterer nextDueDate
//  3) Bygger varselliste (forfalt + forfaller ≤7 dager) og sender e-post
//     via deres eksisterende e-postoppsett (integrasjonspunkt nederst)
// ────────────────────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Ikke autorisert" }, { status: 401 });
  }

  const naa = new Date();

  // 1) Forfalte rapporter
  const overdue = await prisma.report.updateMany({
    where: { status: { in: ["DRAFT", "READY"] }, dueDate: { lt: naa } },
    data: { status: "OVERDUE" },
  });

  // 2) + 3) Neste forfall per aktivt krav
  const requirements = await prisma.reportingRequirement.findMany({
    where: { status: "ACTIVE" },
    select: {
      id: true, title: true, interval: true, scheduleAnchor: true, createdAt: true,
      recipientInstance: true,
      project: {
        select: {
          projectNumber: true, name: true, organizationId: true,
          participants: {
            where: { role: { in: ["OWNER", "PROJECT_MANAGER"] } },
            select: { user: { select: { email: true, name: true } } },
          },
        },
      },
    },
  });

  const varsler: {
    email: string; projectNumber: string; title: string; due: Date; status: string;
  }[] = [];

  for (const r of requirements) {
    const anchor = r.scheduleAnchor ?? r.createdAt;
    const due = nesteForfall(r.interval as ReportInterval, anchor, naa);
    if (!due) continue;

    await prisma.reportingRequirement.update({
      where: { id: r.id },
      data: { nextDueDate: due },
    });

    const status = klassifiser(due, naa);
    if (status === "OVERDUE" || status === "DUE_SOON") {
      for (const part of r.project.participants) {
        varsler.push({
          email: part.user.email,
          projectNumber: r.project.projectNumber,
          title: r.title,
          due,
          status,
        });
      }
    }
  }

  // INTEGRASJONSPUNKT: send e-post via deres eksisterende oppsett
  // (Resend/SendGrid/SMTP). Grupper per mottaker:
  const perMottaker = varsler.reduce<Record<string, typeof varsler>>((acc, v) => {
    (acc[v.email] ??= []).push(v);
    return acc;
  }, {});
  for (const [email, liste] of Object.entries(perMottaker)) {
    await sendForfallsEpost(email, liste);
  }

  return NextResponse.json({
    overdueReportsMarked: overdue.count,
    requirementsChecked: requirements.length,
    notificationsQueued: varsler.length,
  });
}

async function sendForfallsEpost(
  email: string,
  liste: { projectNumber: string; title: string; due: Date; status: string }[]
) {
  // TODO: bytt ut med deres e-postleverandør. Eksempel med Resend:
  //   await resend.emails.send({ to: email, subject: "Rapporteringsforfall", ... })
  console.log(`[forfallsvarsel] til ${email}:`, liste.map((l) =>
    `${l.projectNumber} – ${l.title} (${l.status === "OVERDUE" ? "FORFALT" : "forfaller"} ${l.due.toLocaleDateString("nb-NO")})`
  ).join("; "));
}
