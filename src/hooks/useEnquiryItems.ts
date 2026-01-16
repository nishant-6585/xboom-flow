import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "./use-toast";

export interface EnquiryItem {
  id: string;
  enquiry_id: string;
  product_name: string;
  product_code: string | null;
  product_category: string | null;
  quantity: number;
  unit_price: number;
  gst_percent: number;
  price_includes_gst: boolean;
  gst_amount: number;
  total_amount: number;
  notes: string | null;
  created_at: string;
}

export interface EnquiryItemFormData {
  product_name: string;
  product_code?: string;
  product_category?: string;
  quantity: number;
  unit_price: number;
  gst_percent: number;
  price_includes_gst: boolean;
  notes?: string;
}

export const GST_PERCENT_OPTIONS = [
  { value: 0, label: "0%" },
  { value: 5, label: "5%" },
  { value: 12, label: "12%" },
  { value: 18, label: "18%" },
  { value: 28, label: "28%" },
];

export function calculateGstAndTotal(
  quantity: number,
  unitPrice: number,
  gstPercent: number,
  priceIncludesGst: boolean
): { gstAmount: number; totalAmount: number; baseAmount: number } {
  const basePrice = unitPrice * quantity;
  
  if (priceIncludesGst) {
    // Price includes GST - calculate backward
    const baseAmount = basePrice / (1 + gstPercent / 100);
    const gstAmount = basePrice - baseAmount;
    return { gstAmount, totalAmount: basePrice, baseAmount };
  } else {
    // Price excludes GST - add GST
    const gstAmount = (basePrice * gstPercent) / 100;
    const totalAmount = basePrice + gstAmount;
    return { gstAmount, totalAmount, baseAmount: basePrice };
  }
}

export function useEnquiryItems() {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const fetchEnquiryItems = async (enquiryId: string): Promise<EnquiryItem[]> => {
    try {
      const { data, error } = await supabase
        .from("enquiry_items")
        .select("*")
        .eq("enquiry_id", enquiryId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return (data || []) as EnquiryItem[];
    } catch (error) {
      console.error("Error fetching enquiry items:", error);
      return [];
    }
  };

  const createEnquiryItems = async (
    enquiryId: string,
    items: EnquiryItemFormData[]
  ): Promise<boolean> => {
    setLoading(true);
    try {
      const itemsToInsert = items.map((item) => {
        const { gstAmount, totalAmount } = calculateGstAndTotal(
          item.quantity,
          item.unit_price,
          item.gst_percent,
          item.price_includes_gst
        );

        return {
          enquiry_id: enquiryId,
          product_name: item.product_name,
          product_code: item.product_code || null,
          product_category: item.product_category || "Consumer Drones",
          quantity: item.quantity,
          unit_price: item.unit_price,
          gst_percent: item.gst_percent,
          price_includes_gst: item.price_includes_gst,
          gst_amount: gstAmount,
          total_amount: totalAmount,
          notes: item.notes || null,
        };
      });

      const { error } = await supabase.from("enquiry_items").insert(itemsToInsert);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error("Error creating enquiry items:", error);
      toast({
        title: "Error",
        description: "Failed to create enquiry items",
        variant: "destructive",
      });
      return false;
    } finally {
      setLoading(false);
    }
  };

  const updateEnquiryItem = async (
    itemId: string,
    updates: Partial<EnquiryItemFormData>
  ): Promise<boolean> => {
    setLoading(true);
    try {
      const updateData: Record<string, unknown> = { ...updates };

      // If price-related fields are updated, recalculate GST
      if (
        updates.quantity !== undefined ||
        updates.unit_price !== undefined ||
        updates.gst_percent !== undefined ||
        updates.price_includes_gst !== undefined
      ) {
        // Fetch current item to get missing values
        const { data: currentItem } = await supabase
          .from("enquiry_items")
          .select("*")
          .eq("id", itemId)
          .single();

        if (currentItem) {
          const quantity = updates.quantity ?? currentItem.quantity;
          const unitPrice = updates.unit_price ?? currentItem.unit_price;
          const gstPercent = updates.gst_percent ?? currentItem.gst_percent;
          const priceIncludesGst =
            updates.price_includes_gst ?? currentItem.price_includes_gst;

          const { gstAmount, totalAmount } = calculateGstAndTotal(
            quantity,
            unitPrice,
            gstPercent,
            priceIncludesGst
          );

          updateData.gst_amount = gstAmount;
          updateData.total_amount = totalAmount;
        }
      }

      const { error } = await supabase
        .from("enquiry_items")
        .update(updateData)
        .eq("id", itemId);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error("Error updating enquiry item:", error);
      toast({
        title: "Error",
        description: "Failed to update enquiry item",
        variant: "destructive",
      });
      return false;
    } finally {
      setLoading(false);
    }
  };

  const deleteEnquiryItem = async (itemId: string): Promise<boolean> => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from("enquiry_items")
        .delete()
        .eq("id", itemId);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error("Error deleting enquiry item:", error);
      toast({
        title: "Error",
        description: "Failed to delete enquiry item",
        variant: "destructive",
      });
      return false;
    } finally {
      setLoading(false);
    }
  };

  const deleteEnquiryItemsByEnquiryId = async (enquiryId: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from("enquiry_items")
        .delete()
        .eq("enquiry_id", enquiryId);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error("Error deleting enquiry items:", error);
      return false;
    }
  };

  return {
    loading,
    fetchEnquiryItems,
    createEnquiryItems,
    updateEnquiryItem,
    deleteEnquiryItem,
    deleteEnquiryItemsByEnquiryId,
  };
}
