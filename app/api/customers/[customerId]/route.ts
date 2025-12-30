import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ customerId: string }> },
) {
  const session = await auth();

  if (!session?.user || session.user.role !== "super_admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const resolvedParams = await params;
  const customerId = Number.parseInt(resolvedParams.customerId, 10);
  if (!Number.isInteger(customerId) || customerId <= 0) {
    return NextResponse.json({ error: "Ugyldig kunde-id" }, { status: 400 });
  }

  const apiKey =
    process.env.BJUGSTAD_API_KEY_PRIMARY?.trim() ||
    process.env.BJUGSTAD_API_KEY_SECONDARY?.trim();
  const baseUrl = process.env.BJUGSTAD_API_BASEURL?.trim();

  if (!apiKey || !baseUrl) {
    console.error("Missing Bjugstad API configuration");
    return NextResponse.json(
      { error: "Mangler konfigurasjon for Bjugstad API" },
      { status: 500 },
    );
  }

  const url = `${baseUrl.replace(/\/$/, "")}/GetCustomerById?customerId=${customerId}`;

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
        `Failed to fetch customer ${customerId} from Bjugstad API`,
        response.status,
        body,
      );
      return NextResponse.json(
        { error: "Kunne ikke hente kundeinformasjon" },
        { status: response.status === 404 ? 404 : 502 },
      );
    }

    const customer = await response.json();
    return NextResponse.json({ customer });
  } catch (error) {
    console.error("Unexpected error while fetching customer", error);
    return NextResponse.json(
      { error: "Uventet feil ved henting av kundeinformasjon" },
      { status: 500 },
    );
  }
}
