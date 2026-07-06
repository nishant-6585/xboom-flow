import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type ZohoBookInv = {
  invoice_id: string;
  invoice_number: string | null;
  status: string | null;
  date: string | null;
  total: number | null;
  balance: number | null;
  match_method: string | null;
};

/**
 * Fetch Zoho Books invoices linked to a given internal order number.
 * Kept as a tiny hook so the OrderDialog can merge the mirror data with
 * the attached order_invoices rows in one place.
 */
export function useZohoBooksInvoicesForOrder(orderNumber?: string | null) {
  const [invoices, setInvoices] = useState<ZohoBookInv[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!orderNumber) {
      setInvoices([]);
      return;
    }
    let active = true;
    setLoading(true);
    supabase
      .from("zoho_books_invoices")
      .select("invoice_id,invoice_number,status,date,total,balance,match_method")
      .eq("linked_order_number", orderNumber)
      .order("date", { ascending: false })
      .then(({ data }) => {
        if (!active) return;
        setInvoices((data ?? []) as ZohoBookInv[]);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [orderNumber]);

  return { invoices, loading };
}