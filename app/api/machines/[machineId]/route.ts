import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

type MachineResponse = {
  machineId: number;
  make?: string | null;
  model?: string | null;
  productionYear?: string | null;
  number?: string | null;
  category?: string | null;
  registrationNumber?: string | null;
  serialNumber?: string | null;
  location?: string | null;
  railControlDate?: string | null;
  controlDate?: string | null;
  trainingVideos?: string[] | null;
  documentedTrainingVideoUri?: string | null;
  englishDocumentedTrainingVideoUri?: string | null;
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ machineId: string }> },
) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "customer" && session.user.role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const resolvedParams = await params;
  const machineId = Number.parseInt(resolvedParams.machineId, 10);
  if (!Number.isInteger(machineId) || machineId <= 0) {
    return NextResponse.json({ error: "Ugyldig maskin-id" }, { status: 400 });
  }

  const apiKey =
    process.env.BJUGSTAD_API_KEY_PRIMARY?.trim() ||
    process.env.BJUGSTAD_API_KEY_SECONDARY?.trim();
  const baseUrl = process.env.BJUGSTAD_API_BASEURL?.trim();

  if (!apiKey || !baseUrl) {
    console.error("Missing Bjugstad API configuration for machines");
    return NextResponse.json(
      { error: "Mangler konfigurasjon for Bjugstad API" },
      { status: 500 },
    );
  }

  const url = `${baseUrl.replace(/\/$/, "")}/GetMachine/${machineId}`;

  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "Ocp-Apim-Subscription-Key": apiKey,
      },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.error(
        `Failed to fetch machine ${machineId} from Bjugstad API`,
        response.status,
        body,
      );
      return NextResponse.json(
        { error: "Kunne ikke hente maskindetaljer" },
        { status: response.status === 404 ? 404 : 502 },
      );
    }

    const machine = (await response.json()) as MachineResponse;
    return NextResponse.json({ machine });
  } catch (error) {
    console.error("Unexpected error while fetching machine", error);
    return NextResponse.json(
      { error: "Uventet feil ved henting av maskindetaljer" },
      { status: 500 },
    );
  }
}
