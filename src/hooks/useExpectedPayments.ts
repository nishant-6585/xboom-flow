import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "sonner";

export interface ExpectedPayment {
  id: string;
  source_type: 'manual' | 'pipeline' | 'order';
  source_id: string | null;
  order_number: string | null;
  customer_name: string;
  customer_company: string | null;
  amount: number;
  expected_date: string;
  actual_received_date: string | null;
  status: 'pending' | 'received' | 'overdue' | 'cancelled';
  notes: string | null;
  created_by: string;
  created_by_name: string;
  created_at: string;
  updated_at: string;
}

export interface ExpectedPaymentFormData {
  source_type: 'manual' | 'pipeline' | 'order';
  source_id?: string;
  order_number?: string;
  customer_name: string;
  customer_company?: string;
  amount: number;
  expected_date: string;
  notes?: string;
}

export function useExpectedPayments() {
  const [payments, setPayments] = useState<ExpectedPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const { user, profile } = useAuth();

  const fetchPayments = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("expected_payments")
        .select("*")
        .order("expected_date", { ascending: true });

      if (error) throw error;
      setPayments((data || []) as ExpectedPayment[]);
    } catch (error) {
      console.error("Error fetching expected payments:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) {
      fetchPayments();
    }
  }, [user, fetchPayments]);

  const createPayment = async (formData: ExpectedPaymentFormData) => {
    if (!user || !profile) {
      toast.error("You must be logged in");
      return false;
    }

    try {
      const { error } = await supabase.from("expected_payments").insert({
        source_type: formData.source_type,
        source_id: formData.source_id || null,
        order_number: formData.order_number || null,
        customer_name: formData.customer_name,
        customer_company: formData.customer_company || null,
        amount: formData.amount,
        expected_date: formData.expected_date,
        notes: formData.notes || null,
        created_by: user.id,
        created_by_name: profile.name,
        status: 'pending',
      });

      if (error) throw error;
      toast.success("Expected payment added");
      fetchPayments();
      return true;
    } catch (error) {
      console.error("Error creating expected payment:", error);
      toast.error("Failed to add expected payment");
      return false;
    }
  };

  const updatePayment = async (id: string, updates: Partial<ExpectedPayment>) => {
    try {
      const { error } = await supabase
        .from("expected_payments")
        .update(updates)
        .eq("id", id);

      if (error) throw error;
      toast.success("Payment updated");
      fetchPayments();
      return true;
    } catch (error) {
      console.error("Error updating expected payment:", error);
      toast.error("Failed to update payment");
      return false;
    }
  };

  const markAsReceived = async (id: string, receivedDate?: string) => {
    return updatePayment(id, {
      status: 'received',
      actual_received_date: receivedDate || new Date().toISOString().split('T')[0],
    });
  };

  const deletePayment = async (id: string) => {
    try {
      const { error } = await supabase
        .from("expected_payments")
        .delete()
        .eq("id", id);

      if (error) throw error;
      toast.success("Payment deleted");
      fetchPayments();
      return true;
    } catch (error) {
      console.error("Error deleting expected payment:", error);
      toast.error("Failed to delete payment");
      return false;
    }
  };

  return {
    payments,
    loading,
    createPayment,
    updatePayment,
    markAsReceived,
    deletePayment,
    refetch: fetchPayments,
  };
}
