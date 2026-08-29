import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/lib/access";
import DocumentHotelClient from "./DocumentHotelClient";

export default async function DokumenterPage() {
  const session = await requireAuthenticatedUser();
  if (!session) redirect("/login");

  return <DocumentHotelClient />;
}
