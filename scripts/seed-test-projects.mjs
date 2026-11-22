// scripts/seed-test-projects.mjs
//
// Creates demo projects that only super admins can see.
//
// The projects belong to a dedicated test customer with a negative id. No user is
// given access to that customer, so the normal access rules hide the projects from
// everyone except super admins. The Bjugstad customer sync only upserts real
// (positive) customer ids, so it never touches this customer.
//
// Machines are not seeded here. The test customer has no rental agreements in the
// Bjugstad register, so lib/test-agreements.ts builds demo agreements for TEST-001
// and TEST-002 at request time, using real machines from the machines table. The
// customer id and project numbers below must match that file.
//
// Demo users are seeded so the "Brukertilganger" tab has someone to show and add.
// They belong to the test customer only, have no phone number and a reserved
// .example e-mail address, so nobody can log in as them. Because they are tied to
// the test customer, they are the one exception to "no user has access" above.
//
// Usage:
//   npm run seed:test-projects            create missing test projects, demo users and participants
//   npm run seed:test-projects -- --reset recreate all test projects from scratch
//   npm run seed:test-projects -- --remove delete the test customer, its projects and the demo users

import { PrismaClient } from "@prisma/client";

const TEST_CUSTOMER_ID = -1000;
const TEST_CUSTOMER_NAME = "[TEST] Demo Entreprenør AS";

// Fixed ids, so the users can be found again and removed. `projects` maps a test
// project number to the user's role on that project.
const TEST_USERS = [
  {
    id: "test-user-prosjektleder",
    name: "[TEST] Kari Prosjektleder",
    email: "kari.prosjektleder@demo-entreprenor.example",
    companyRole: "user",
    projects: { "TEST-001": "OWNER" },
  },
  {
    id: "test-user-deltaker",
    name: "[TEST] Per Deltaker",
    email: "per.deltaker@demo-entreprenor.example",
    companyRole: "user",
    projects: { "TEST-001": "MEMBER" },
  },
  {
    // On no project: shows up as someone who can be added.
    id: "test-user-ledig",
    name: "[TEST] Anne Anleggsleder",
    email: "anne.anleggsleder@demo-entreprenor.example",
    companyRole: "user",
    projects: {},
  },
  {
    // Company admin: has access to every test project without being a participant.
    id: "test-user-selskapsadmin",
    name: "[TEST] Ola Selskapsadmin",
    email: "ola.selskapsadmin@demo-entreprenor.example",
    companyRole: "admin",
    projects: {},
  },
];
const TEST_USER_IDS = TEST_USERS.map((user) => user.id);

const args = new Set(process.argv.slice(2));
const prisma = new PrismaClient();

function polygon(points) {
  return { type: "Polygon", coordinates: [[...points, points[0]]] };
}

const PROJECTS = [
  {
    projectNumber: "TEST-001",
    name: "[TEST] Bjørvika Felt B4",
    description:
      "Demoprosjekt for interne tester. Graving, sprengning og massehåndtering for nytt kvartal med VA-anlegg.",
    addressLine: "Dronning Eufemias gate 30",
    postalCode: "0191",
    city: "Oslo",
    contractType: "NS_8407",
    contractSizeNok: 84_500_000,
    clientType: "PUBLIC",
    clientName: "Demo Byggherre KF",
    clientAddress: "Testveien 1, 0150 Oslo",
    clientEmail: "post@demo-byggherre.example",
    clientContactName: "Kari Testesen",
    clientContactEmail: "kari@demo-byggherre.example",
    clientContactPhone: "+47 900 00 001",
    status: "ACTIVE",
    startDate: new Date("2026-03-02"),
    endDate: new Date("2027-12-20"),
    kpis: [
      { metric: "MAX_CO2_KG", label: "CO2 fra maskiner", targetValue: 120000, currentValue: 78000, unit: "kg", contractRef: "Bilag B pkt. 4.2" },
      { metric: "MAX_IDLE_PCT", label: "Tomgang", targetValue: 25, currentValue: 23.5, unit: "%", contractRef: "Bilag B pkt. 4.3" },
      { metric: "MIN_HVO_PCT", label: "HVO-andel", targetValue: 60, currentValue: 41, unit: "%", contractRef: "Bilag B pkt. 4.4" },
      { metric: "MIN_MASS_REUSE_PCT", label: "Massegjenbruk", targetValue: 70, currentValue: null, unit: "%", contractRef: null },
    ],
    massPlan: [
      { plannedIn: 1200, plannedOut: 12500 },
      { plannedIn: 6200, plannedOut: 900 },
      { plannedIn: 0, plannedOut: 3400 },
    ],
    zones: [
      {
        name: "Anleggsområde",
        color: "#2563EB",
        geometry: polygon([
          [10.7528, 59.9071],
          [10.7569, 59.9073],
          [10.7574, 59.9058],
          [10.7531, 59.9055],
        ]),
      },
      {
        name: "Riggplass",
        color: "#D97706",
        geometry: polygon([
          [10.7579, 59.9069],
          [10.7594, 59.9069],
          [10.7594, 59.9062],
          [10.7579, 59.9062],
        ]),
      },
    ],
  },
  {
    projectNumber: "TEST-002",
    name: "[TEST] Løren Miljøgate",
    description: "Demoprosjekt i planleggingsfase. Ingen anleggssoner er tegnet ennå.",
    addressLine: "Lørenveien 50",
    postalCode: "0585",
    city: "Oslo",
    contractType: "NS_8405",
    contractSizeNok: 41_200_000,
    clientType: "PUBLIC",
    clientName: "Demo Kommune, Bymiljøetaten",
    clientContactName: "Per Prøve",
    clientContactPhone: "+47 900 00 002",
    status: "PLANNING",
    startDate: new Date("2027-01-04"),
    endDate: new Date("2027-11-30"),
    kpis: [
      { metric: "MIN_ELECTRIC_PCT", label: "Elektriske maskiner", targetValue: 30, currentValue: 35, unit: "%", contractRef: "Kap. C 2.1" },
      { metric: "MAX_DIESEL_LITERS", label: "Dieselforbruk", targetValue: 40000, currentValue: 12000, unit: "liter", contractRef: null },
    ],
    massPlan: [{ plannedIn: 800, plannedOut: 4100 }],
    zones: [],
  },
  {
    projectNumber: "TEST-003",
    name: "[TEST] Ski Sentrum Øst",
    description: null,
    addressLine: null,
    postalCode: "1400",
    city: "Ski",
    contractType: "OTHER",
    contractSizeNok: null,
    clientType: "PRIVATE",
    clientName: "Demo Eiendom AS",
    status: "ON_HOLD",
    startDate: new Date("2025-06-01"),
    endDate: null,
    kpis: [],
    massPlan: [],
    zones: [],
  },
];

async function removeAll() {
  const deleted = await prisma.customer.deleteMany({ where: { customer_id: TEST_CUSTOMER_ID } });
  console.log(
    deleted.count
      ? `Removed ${TEST_CUSTOMER_NAME} and all its projects, zones, KPIs and folders.`
      : "No test customer found. Nothing to remove.",
  );
  // Only the fixed demo ids are deleted, never a real user.
  const deletedUsers = await prisma.user.deleteMany({ where: { id: { in: TEST_USER_IDS } } });
  if (deletedUsers.count) console.log(`Removed ${deletedUsers.count} demo user(s).`);
}

async function seedUsers() {
  for (const user of TEST_USERS) {
    await prisma.user.upsert({
      where: { id: user.id },
      update: { name: user.name },
      create: { id: user.id, name: user.name, email: user.email, role: "customer" },
    });
    await prisma.userCustomerAccess.upsert({
      where: { userId_customerId: { userId: user.id, customerId: TEST_CUSTOMER_ID } },
      update: {},
      create: { userId: user.id, customerId: TEST_CUSTOMER_ID, role: user.companyRole },
    });
  }
  console.log(`Demo users ready (${TEST_USERS.length}).`);
}

// Adds the demo participants that are missing. Existing rows are left alone, so
// changes made while testing the Brukertilganger tab survive a re-run.
async function seedParticipants(projectId, projectNumber) {
  for (const user of TEST_USERS) {
    const role = user.projects[projectNumber];
    if (!role) continue;
    await prisma.projectParticipant.upsert({
      where: { projectId_userId: { projectId, userId: user.id } },
      update: {},
      create: { projectId, userId: user.id, role },
    });
  }
}

async function seed({ reset }) {
  await prisma.customer.upsert({
    where: { customer_id: TEST_CUSTOMER_ID },
    update: { name: TEST_CUSTOMER_NAME },
    create: {
      customer_id: TEST_CUSTOMER_ID,
      name: TEST_CUSTOMER_NAME,
      email: "test@demo-entreprenor.example",
      city: "Oslo",
    },
  });

  await seedUsers();

  const strayAccesses = await prisma.userCustomerAccess.count({
    where: { customerId: TEST_CUSTOMER_ID, userId: { notIn: TEST_USER_IDS } },
  });
  if (strayAccesses > 0) {
    console.warn(
      `Warning: ${strayAccesses} real user(s) have access to the test customer, so they can also see the test projects.`,
    );
  }

  const creator = await prisma.user.findFirst({
    where: { role: "super_admin" },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  const massTypes = await prisma.massTypeCatalog.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true },
  });

  for (const definition of PROJECTS) {
    const { kpis, massPlan, zones, ...fields } = definition;
    const existing = await prisma.project.findUnique({
      where: {
        customerId_projectNumber: { customerId: TEST_CUSTOMER_ID, projectNumber: fields.projectNumber },
      },
      select: { id: true },
    });

    if (existing && !reset) {
      await seedParticipants(existing.id, fields.projectNumber);
      console.log(`Kept ${fields.projectNumber} (exists, use --reset to recreate), demo participants checked`);
      continue;
    }
    if (existing) await prisma.project.delete({ where: { id: existing.id } });

    const project = await prisma.project.create({
      data: {
        ...fields,
        customer: { connect: { customer_id: TEST_CUSTOMER_ID } },
        ...(creator ? { createdBy: { connect: { id: creator.id } } } : {}),
        kpis: { create: kpis },
        massTypes: {
          create: massPlan
            .map((plan, index) => (massTypes[index] ? { massTypeId: massTypes[index].id, ...plan } : null))
            .filter(Boolean),
        },
        zones: {
          create: zones.map((zone, index) => ({ ...zone, sortOrder: index })),
        },
      },
      select: { id: true, projectNumber: true },
    });
    await seedParticipants(project.id, project.projectNumber);
    console.log(`${existing ? "Recreated" : "Created"} ${project.projectNumber} (${project.id})`);
  }
}

try {
  if (args.has("--remove")) {
    await removeAll();
  } else {
    await seed({ reset: args.has("--reset") });
  }
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
