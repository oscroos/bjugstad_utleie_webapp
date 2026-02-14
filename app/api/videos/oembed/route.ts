import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isYoutubeUrl } from "@/lib/youtube";

const YOUTUBE_OEMBED_ENDPOINT = "https://www.youtube.com/oembed";

export async function GET(request: NextRequest) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get("url");

  if (!targetUrl) {
    return NextResponse.json({ error: "Missing url" }, { status: 400 });
  }

  if (!isYoutubeUrl(targetUrl)) {
    return NextResponse.json({ error: "Only YouTube links are supported" }, { status: 400 });
  }

  const oEmbedUrl = `${YOUTUBE_OEMBED_ENDPOINT}?format=json&url=${encodeURIComponent(targetUrl)}`;

  try {
    const response = await fetch(oEmbedUrl, {
      headers: { Accept: "application/json" },
      // Cache for a short time to avoid hitting the endpoint on every dialog open.
      next: { revalidate: 60 * 60 },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.error("Failed to fetch YouTube oEmbed", response.status, body);
      return NextResponse.json(
        { error: "Kunne ikke hente videoinfo" },
        { status: response.status === 404 ? 404 : 502 },
      );
    }

    const payload = (await response.json()) as {
      title?: string;
      author_name?: string;
      provider_name?: string;
      thumbnail_url?: string;
    };

    return NextResponse.json({
      title: payload.title ?? null,
      author: payload.author_name ?? null,
      provider: payload.provider_name ?? null,
      thumbnail: payload.thumbnail_url ?? null,
      url: targetUrl,
    });
  } catch (error) {
    console.error("Unexpected error while fetching oEmbed metadata", error);
    return NextResponse.json(
      { error: "Uventet feil ved henting av videoinfo" },
      { status: 500 },
    );
  }
}
