import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

const INLINE_CONTENT_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "text/plain",
  "text/csv",
]);

function appendSasToken(filePath: string, sasToken?: string) {
  const normalizedFilePath = filePath.trim();
  const normalizedSasToken = sasToken?.trim().replace(/^\?/, "");

  if (!normalizedFilePath || !normalizedSasToken) {
    return normalizedFilePath;
  }

  return `${normalizedFilePath}${normalizedFilePath.includes("?") ? "&" : "?"}${normalizedSasToken}`;
}

function sanitizeFileName(fileName?: string | null) {
  return (fileName?.trim() || "attachment").replace(/[\\/\r\n"]/g, "_");
}

function inferContentType(fileName: string) {
  const lower = fileName.toLowerCase();

  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".txt")) return "text/plain; charset=utf-8";
  if (lower.endsWith(".csv")) return "text/csv; charset=utf-8";

  return "application/octet-stream";
}

function resolveContentType(fileName: string, upstreamContentType?: string | null) {
  const normalizedUpstreamContentType = upstreamContentType?.trim().toLowerCase() || "";
  const inferredContentType = inferContentType(fileName);

  if (
    !normalizedUpstreamContentType ||
    normalizedUpstreamContentType === "application/octet-stream"
  ) {
    return inferredContentType;
  }

  return upstreamContentType!.trim();
}

function canDisplayInline(contentType: string) {
  const normalizedContentType = contentType.split(";")[0].trim().toLowerCase();
  return INLINE_CONTENT_TYPES.has(normalizedContentType);
}

function isAllowedBlobUrl(fileUrl: URL) {
  return fileUrl.protocol === "https:" && fileUrl.hostname.endsWith(".blob.core.windows.net");
}

function resolveSasToken(sasSource: string) {
  return sasSource === "rail"
    ? process.env.AZURE_BLOB_SAS_TOKEN_RAIL
    : process.env.AZURE_BLOB_SAS_TOKEN;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }

  return "Ukjent feil";
}

export async function GET(request: Request) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "customer" && session.user.role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const rawFilePath = searchParams.get("filePath")?.trim() || "";
  const requestedName = sanitizeFileName(searchParams.get("name"));
  const sasSource = searchParams.get("sasSource")?.trim() === "rail" ? "rail" : "default";
  const sasToken = resolveSasToken(sasSource);

  if (!rawFilePath) {
    return NextResponse.json(
      { error: "Mangler filsti for vedlegget i foresporselen." },
      { status: 400 },
    );
  }

  let sourceUrl: URL;

  try {
    sourceUrl = new URL(rawFilePath);
  } catch {
    return NextResponse.json(
      { error: `Ugyldig filsti for vedlegget "${requestedName}".` },
      { status: 400 },
    );
  }

  if (!isAllowedBlobUrl(sourceUrl)) {
    return NextResponse.json(
      { error: `Blob-URLen for vedlegget "${requestedName}" er ikke tillatt.` },
      { status: 400 },
    );
  }

  if (!sasToken?.trim()) {
    return NextResponse.json(
      {
        error:
          sasSource === "rail"
            ? "AZURE_BLOB_SAS_TOKEN_RAIL mangler i serverkonfigurasjonen."
            : "AZURE_BLOB_SAS_TOKEN mangler i serverkonfigurasjonen.",
      },
      { status: 500 },
    );
  }

  try {
    const blobResponse = await fetch(appendSasToken(sourceUrl.toString(), sasToken), {
      cache: "no-store",
      redirect: "follow",
    });

    console.log("Machine attachment upstream response", {
      fileName: requestedName,
      sourceUrl: sourceUrl.toString(),
      sasSource,
      status: blobResponse.status,
      contentType: blobResponse.headers.get("content-type"),
      contentDisposition: blobResponse.headers.get("content-disposition"),
      contentLength: blobResponse.headers.get("content-length"),
      cacheControl: blobResponse.headers.get("cache-control"),
    });

    if (!blobResponse.ok) {
      const body = await blobResponse.text().catch(() => "");
      console.error(
        "Failed to fetch machine attachment blob",
        blobResponse.status,
        body,
      );

      const statusMessage =
        blobResponse.status === 404
          ? `Vedlegget "${requestedName}" ble ikke funnet i blob-lagringen.`
          : blobResponse.status === 401 || blobResponse.status === 403
            ? `Tilgang nektet ved henting av vedlegget "${requestedName}". Kontroller SAS-token og blob-rettigheter.`
            : `Blob-lagringen svarte med status ${blobResponse.status} ved henting av vedlegget "${requestedName}".`;

      return NextResponse.json(
        { error: statusMessage },
        { status: blobResponse.status === 404 ? 404 : 502 },
      );
    }

    const contentType = resolveContentType(
      requestedName,
      blobResponse.headers.get("content-type"),
    );
    const contentDispositionType = canDisplayInline(contentType) ? "inline" : "attachment";
    const headers = new Headers();

    headers.set("Content-Type", contentType);
    headers.set(
      "Content-Disposition",
      `${contentDispositionType}; filename="${requestedName}"; filename*=UTF-8''${encodeURIComponent(requestedName)}`,
    );

    const contentLength = blobResponse.headers.get("content-length");
    if (contentLength) {
      headers.set("Content-Length", contentLength);
    }

    console.log("Machine attachment proxy response", {
      fileName: requestedName,
      sourceUrl: sourceUrl.toString(),
      sasSource,
      status: 200,
      contentType: headers.get("Content-Type"),
      contentDisposition: headers.get("Content-Disposition"),
      contentLength: headers.get("Content-Length"),
    });

    return new NextResponse(blobResponse.body, {
      status: 200,
      headers,
    });
  } catch (error) {
    console.error("Unexpected error while proxying machine attachment", error);
    return NextResponse.json(
      {
        error: `Uventet feil ved henting av vedlegget "${requestedName}": ${getErrorMessage(error)}`,
      },
      { status: 500 },
    );
  }
}
