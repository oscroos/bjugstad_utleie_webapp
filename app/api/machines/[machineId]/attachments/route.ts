import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

type AttachmentResponse = {
  id: number;
  name: string;
  description: string | null;
  fileName: string;
  uploadedDate: string;
  filePath: string;
  fileSize: number;
  uploadedBy: string;
  internal: boolean;
  transportOrderId: number | null;
  rentalId: number | null;
  containerName: string | null;
  type: string | null;
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

  const { machineId } = await params;
  const normalizedId = typeof machineId === "string" ? machineId.trim() : "";
  if (!normalizedId) {
    return NextResponse.json({ error: "Ugyldig maskin-id" }, { status: 400 });
  }

  const apiKey =
    process.env.BJUGSTAD_API_KEY_PRIMARY?.trim() ||
    process.env.BJUGSTAD_API_KEY_SECONDARY?.trim();
  const baseUrl = process.env.BJUGSTAD_API_BASEURL?.trim();

  if (!apiKey || !baseUrl) {
    console.error("Missing Bjugstad API configuration for machine attachments");
    return NextResponse.json(
      { error: "Mangler konfigurasjon for Bjugstad API" },
      { status: 500 },
    );
  }

  const url = `${baseUrl.replace(/\/$/, "")}/GetMachineAttachments/${encodeURIComponent(
    normalizedId,
  )}`;

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
        `Failed to fetch attachments for machine ${normalizedId} from Bjugstad API`,
        response.status,
        body,
      );
      return NextResponse.json(
        { error: "Kunne ikke hente vedlegg" },
        { status: response.status === 404 ? 404 : 502 },
      );
    }

    const attachments = ((await response.json()) as AttachmentResponse[]).filter(
      (item) => item && item.internal === false,
    );

    return NextResponse.json({ attachments });
  } catch (error) {
    console.error("Unexpected error while fetching machine attachments", error);
    return NextResponse.json(
      { error: "Uventet feil ved henting av vedlegg" },
      { status: 500 },
    );
  }
}
