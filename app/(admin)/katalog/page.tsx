import { redirect } from "next/navigation";
import ErrorPanel from "@/components/ErrorPanel";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import CatalogAdminClient, {
  type FieldDefinitionRow,
  type MassTypeRow,
} from "./CatalogAdminClient";

export default async function KatalogPage() {
  const session = await auth();

  if (!session) {
    redirect("/login");
  }

  if (session.user?.role !== "super_admin") {
    return (
      <main className="p-8">
        <section className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          <h1 className="text-2xl font-semibold text-slate-900">Begrenset tilgang</h1>
          <p className="mt-3 text-slate-600">
            Du trenger administratorrettigheter for å administrere kataloger.
          </p>
        </section>
      </main>
    );
  }

  try {
    const [massTypes, fieldDefinitions] = await Promise.all([
      prisma.massTypeCatalog.findMany({
        orderBy: [{ active: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
      }),
      prisma.projectFieldDefinition.findMany({
        orderBy: [{ active: "desc" }, { sortOrder: "asc" }, { label: "asc" }],
      }),
    ]);

    return (
      <main className="space-y-6 p-8">
        <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-slate-900">Katalog</h1>
            <p className="mt-2 text-slate-600">
              Administrer massetyper og egendefinerte prosjektfelt for kundeportalen.
            </p>
          </div>
        </header>

        <CatalogAdminClient
          initialMassTypes={massTypes.map(toMassTypeRow)}
          initialFieldDefinitions={fieldDefinitions.map(toFieldDefinitionRow)}
        />
      </main>
    );
  } catch (error) {
    return (
      <main className="p-8">
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <ErrorPanel
            withSidebar
            title="Kunne ikke hente kataloger"
            error={error}
          />
        </section>
      </main>
    );
  }
}

function toMassTypeRow(row: {
  id: string;
  name: string;
  unit: string;
  defaultClassification: string;
  tonnPerM3: number;
  swellFactor: number;
  active: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}): MassTypeRow {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toFieldDefinitionRow(row: {
  id: string;
  label: string;
  fieldType: FieldDefinitionRow["fieldType"];
  options: string[];
  required: boolean;
  active: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}): FieldDefinitionRow {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
