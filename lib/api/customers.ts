import type { CustomerDetails } from "@/components/dialogs/CustomerAccessDialog";

type FetchCustomerOptions = {
  signal?: AbortSignal;
};

export async function fetchCustomerDetails(
  customerId: number,
  options?: FetchCustomerOptions,
): Promise<CustomerDetails | null> {
  const response = await fetch(`/api/customers/${customerId}`, {
    cache: "no-store",
    signal: options?.signal,
  });
  const payload = (await response.json().catch(() => ({}))) as {
    customer?: CustomerDetails;
    error?: string;
  };
  if (!response.ok) {
    throw new Error(payload.error ?? "Kunne ikke hente kundeinformasjon");
  }
  return payload.customer ?? null;
}
