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

function buildDownloadPath(
  filePath: string,
  name?: string | null,
  attachmentType?: string | null,
) {
  const params = new URLSearchParams({ filePath });

  if (name?.trim()) {
    params.set("name", name.trim());
  }

  params.set("sasSource", attachmentType == null ? "default" : "rail");

  return `/api/machines/attachments/download?${params.toString()}`;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  return "Ukjent feil";
}

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

      const errorMessage =
        response.status === 404
          ? `Fant ingen vedlegg for maskin ${normalizedId}.`
          : response.status === 401 || response.status === 403
            ? `Tilgang nektet ved henting av vedlegg for maskin ${normalizedId}. Kontroller API-nokkel og rettigheter.`
            : `Bjugstad API svarte med status ${response.status} ved henting av vedlegg for maskin ${normalizedId}.`;

      return NextResponse.json(
        { error: errorMessage },
        { status: response.status === 404 ? 404 : 502 },
      );
    }

    const attachments = ((await response.json()) as AttachmentResponse[])
      .filter((item) => item && item.internal === false)
      .map((item) => ({
        ...item,
        filePath: buildDownloadPath(
          item.filePath,
          item.name || item.fileName,
          item.type,
        ),
      }));

    return NextResponse.json({ attachments });
  } catch (error) {
    console.error("Unexpected error while fetching machine attachments", error);
    return NextResponse.json(
      {
        error: `Uventet feil ved henting av vedlegg for maskin ${normalizedId}: ${getErrorMessage(error)}`,
      },
      { status: 500 },
    );
  }
}
