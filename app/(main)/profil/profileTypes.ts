import type {
  CustomerAccessEntry,
  CustomerDetails,
} from "@/components/dialogs/CustomerAccessDialog";

export type CompanyCardState = {
  customerId: number;
  company: CustomerDetails | null;
  accesses: CustomerAccessEntry[];
  status: "ready" | "error";
  error: string | null;
};
