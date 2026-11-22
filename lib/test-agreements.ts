// lib/test-agreements.ts
//
// Demo rental agreements for the test customer created by
// scripts/seed-test-projects.mjs.
//
// Machines reach a project through rental agreements in the Bjugstad register,
// and the test customer does not exist there, so its projects could never show
// machines. This module builds a small, fixed set of demo agreements at request
// time and fills them with real machines from our own machines table. Because
// the machines are real, the machine card, position and history work as they do
// for a normal customer. Nothing is stored or written.
//
// Only super admins are given these agreements (see listProjectMachines).

import { prisma } from "@/lib/prisma";
import type { AgreementPayload } from "@/lib/agreements";

/** Must match TEST_CUSTOMER_ID in scripts/seed-test-projects.mjs. */
export const TEST_CUSTOMER_ID = -1000;
const TEST_CUSTOMER_NAME = "[TEST] Demo Entreprenør AS";

export type TestMachine = { id: string; name: string | null; make: string | null };

type AgreementTemplate = {
  id: string;
  /** Must match a projectNumber in scripts/seed-test-projects.mjs. */
  projectNumber: string;
  machineCount: number;
  /** Days relative to today, so the agreements never drift out of their state. */
  startOffsetDays: number;
  endOffsetDays: number | null;
  location: string;
  comment: string;
};

// One agreement per state the project page has to handle. TEST-003 has none on
// purpose, so the empty state stays testable.
const AGREEMENT_TEMPLATES: AgreementTemplate[] = [
  {
    id: "TEST-A-1001",
    projectNumber: "TEST-001",
    machineCount: 3,
    startOffsetDays: -120,
    endOffsetDays: null,
    location: "Dronning Eufemias gate 30, Oslo",
    comment: "Demoavtale uten sluttdato (løpende leie).",
  },
  {
    id: "TEST-A-1002",
    projectNumber: "TEST-001",
    machineCount: 1,
    startOffsetDays: -45,
    endOffsetDays: 240,
    location: "Dronning Eufemias gate 30, Oslo",
    comment: "Demoavtale med sluttdato frem i tid.",
  },
  {
    id: "TEST-A-1003",
    projectNumber: "TEST-001",
    machineCount: 1,
    startOffsetDays: -200,
    endOffsetDays: -30,
    location: "Dronning Eufemias gate 30, Oslo",
    comment: "Demoavtale som er avsluttet.",
  },
  {
    id: "TEST-A-2001",
    projectNumber: "TEST-002",
    machineCount: 2,
    startOffsetDays: 30,
    endOffsetDays: 330,
    location: "Lørenveien 50, Oslo",
    comment: "Demoavtale som ikke har startet ennå.",
  },
];

const MACHINES_NEEDED = AGREEMENT_TEMPLATES.reduce((sum, template) => sum + template.machineCount, 0);

/**
 * Hands the machines out to the demo agreements in order. With too few machines
 * the later agreements get fewer, and agreements left without a machine are
 * dropped.
 */
export function buildTestAgreements(machines: TestMachine[], now: Date = new Date()): AgreementPayload[] {
  const agreements: AgreementPayload[] = [];
  let cursor = 0;

  for (const template of AGREEMENT_TEMPLATES) {
    const assigned = machines.slice(cursor, cursor + template.machineCount);
    cursor += assigned.length;
    if (!assigned.length) continue;

    agreements.push({
      id: template.id,
      customerId: TEST_CUSTOMER_ID,
      customerName: TEST_CUSTOMER_NAME,
      startDate: offsetDate(now, template.startOffsetDays),
      endDate: template.endOffsetDays === null ? null : offsetDate(now, template.endOffsetDays),
      comment: template.comment,
      projectNumber: template.projectNumber,
      contactPersonName: "Kari Testesen",
      contactPersonTelephoneNumber: "+47 900 00 001",
      contactPersonEmail: "kari@demo-byggherre.example",
      location: template.location,
      insuranceIncluded: true,
      contractPrice: false,
      createdBy: "Testdata",
      machines: assigned.map((machine) => ({
        id: machine.id,
        name: machine.name,
        make: machine.make,
      })),
    });
  }

  return agreements;
}

/**
 * Demo agreements filled with real machines. Machines with a known position are
 * preferred, and the lowest ids are used so the same machines come back on every
 * load.
 */
export async function loadTestAgreements(): Promise<AgreementPayload[]> {
  const select = { id: true, name: true, oemName: true } as const;

  const positioned = await prisma.machine.findMany({
    where: { lastPosLatitude: { not: null }, lastPosLongitude: { not: null } },
    orderBy: { id: "asc" },
    take: MACHINES_NEEDED * 5,
    select,
  });
  let machines = positioned.filter(hasRegisterId);

  if (machines.length < MACHINES_NEEDED) {
    const known = new Set(machines.map((machine) => machine.id));
    const others = await prisma.machine.findMany({
      orderBy: { id: "asc" },
      take: MACHINES_NEEDED * 5,
      select,
    });
    machines = [...machines, ...others.filter((machine) => hasRegisterId(machine) && !known.has(machine.id))];
  }

  return buildTestAgreements(
    machines.slice(0, MACHINES_NEEDED).map((machine) => ({
      id: machine.id,
      name: machine.name?.trim() || `Maskin ${machine.id}`,
      make: machine.oemName && machine.oemName !== "N/A" ? machine.oemName : null,
    })),
  );
}

// The machine card looks machines up in the Bjugstad register by numeric id.
function hasRegisterId(machine: { id: string }) {
  return /^\d+$/.test(machine.id);
}

function offsetDate(now: Date, days: number) {
  const date = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
}
