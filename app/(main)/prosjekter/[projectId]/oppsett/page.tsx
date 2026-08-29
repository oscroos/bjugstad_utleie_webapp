import Link from "next/link";
import { notFound } from "next/navigation";
import ErrorPanel from "@/components/ErrorPanel";
import { requireProjectRole } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { getActiveProjectSetupCatalog } from "@/lib/projects";
import ProjectSetupForm, {
  type ProjectSetupCustomer,
  type ProjectSetupInitialProject,
} from "../../ProjectSetupForm";

type PageProps = {
  params: Promise<{ projectId: string }>;
};

export default async function ProsjektOppsettPage({ params }: PageProps) {
  const { projectId } = await params;
  const access = await requireProjectRole(projectId, "VIEWER");

  if (!access) {
    notFound();
  }

  try {
    const [project, catalog] = await Promise.all([
      prisma.project.findUnique({
        where: { id: projectId },
        include: {
          customer: {
            select: {
              customer_id: true,
              name: true,
              organization_number: true,
            },
          },
          fieldValues: {
            select: {
              definitionId: true,
              value: true,
            },
          },
          massTypes: {
            select: {
              massTypeId: true,
              plannedIn: true,
              plannedOut: true,
            },
          },
          kpis: {
            select: {
              id: true,
              metric: true,
              label: true,
              targetValue: true,
              currentValue: true,
              unit: true,
              contractRef: true,
            },
            orderBy: { createdAt: "asc" },
          },
        },
      }),
      getActiveProjectSetupCatalog(),
    ]);

    if (!project) {
      notFound();
    }

    const customer: ProjectSetupCustomer = {
      id: project.customer.customer_id,
      name: project.customer.name,
      organizationNumber: project.customer.organization_number,
    };

    return (
      <main className="space-y-6 p-8">
        <header className="space-y-2">
          <Link href="/prosjekter" className="text-sm font-semibold text-blue-700 hover:text-blue-900">
            Tilbake til prosjekter
          </Link>
          <div>
            <h1 className="text-3xl font-semibold text-slate-900">Prosjektoppsett</h1>
            <p className="mt-2 text-slate-600">
              {project.projectNumber} · {project.name}
            </p>
          </div>
        </header>

        <ProjectSetupForm
          mode="edit"
          customers={[customer]}
          fieldDefinitions={catalog.fieldDefinitions}
          massTypes={catalog.massTypes}
          project={toInitialProject(project)}
        />
      </main>
    );
  } catch (error) {
    return (
      <main className="p-8">
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <ErrorPanel
            withSidebar
            title="Kunne ikke laste prosjektoppsett"
            error={error}
          />
        </section>
      </main>
    );
  }
}

function toInitialProject(project: {
  id: string;
  customerId: number;
  projectNumber: string;
  name: string;
  description: string | null;
  addressLine: string | null;
  postalCode: string | null;
  city: string | null;
  contractType: ProjectSetupInitialProject["contractType"];
  contractSizeNok: number | null;
  clientType: ProjectSetupInitialProject["clientType"];
  clientName: string | null;
  clientAddress: string | null;
  clientEmail: string | null;
  clientContactName: string | null;
  clientContactEmail: string | null;
  clientContactPhone: string | null;
  status: ProjectSetupInitialProject["status"];
  startDate: Date | null;
  endDate: Date | null;
  fieldValues: Array<{ definitionId: string; value: string }>;
  massTypes: Array<{ massTypeId: string; plannedIn: number; plannedOut: number }>;
  kpis: ProjectSetupInitialProject["kpis"];
}): ProjectSetupInitialProject {
  return {
    id: project.id,
    customerId: project.customerId,
    projectNumber: project.projectNumber,
    name: project.name,
    description: project.description,
    addressLine: project.addressLine,
    postalCode: project.postalCode,
    city: project.city,
    contractType: project.contractType,
    contractSizeNok: project.contractSizeNok,
    clientType: project.clientType,
    clientName: project.clientName,
    clientAddress: project.clientAddress,
    clientEmail: project.clientEmail,
    clientContactName: project.clientContactName,
    clientContactEmail: project.clientContactEmail,
    clientContactPhone: project.clientContactPhone,
    status: project.status,
    startDate: project.startDate?.toISOString() ?? null,
    endDate: project.endDate?.toISOString() ?? null,
    fieldValues: project.fieldValues,
    massTypes: project.massTypes,
    kpis: project.kpis,
  };
}
