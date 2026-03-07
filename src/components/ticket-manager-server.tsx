import { unstable_noStore as noStore } from "next/cache";
import { TicketManager } from "@/components/ticket-manager";
import { searchTickets } from "@/modules/tickets/application/get-tickets";

export const TicketManagerServer = async () => {
  noStore();
  const initialTickets = await searchTickets({ page: 1, pageSize: 50 });

  return <TicketManager initialTickets={initialTickets} />;
};
