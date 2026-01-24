import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export type TrainingType = 'demo' | 'training';
export type TrainingCategory = 'drone_ops' | 'software_usage' | 'both';
export type TrainingPaymentStatus = 'pending' | 'partial' | 'paid';
export type TrainingStatus = 'requested' | 'pending' | 'done';

export interface Training {
  id: string;
  training_number: string | null;
  client_name: string;
  city: string;
  model_name: string | null;
  type: TrainingType;
  category: TrainingCategory;
  no_of_people: number;
  trainee_names: string[];
  amount_quoted: number;
  amount_paid: number;
  status: TrainingStatus;
  payment_status: TrainingPaymentStatus;
  training_date: string | null;
  pictures: string[];
  notes: string | null;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface TrainingFormData {
  client_name: string;
  city: string;
  model_name?: string;
  type: TrainingType;
  category: TrainingCategory;
  no_of_people: number;
  trainee_names: string[];
  amount_quoted: number;
  amount_paid: number;
  payment_status: TrainingPaymentStatus;
  status: TrainingStatus;
  training_date?: string | null;
  notes?: string;
}

export const TRAINING_TYPES: { value: TrainingType; label: string }[] = [
  { value: 'demo', label: 'Demo' },
  { value: 'training', label: 'Training' },
];

export const TRAINING_CATEGORIES: { value: TrainingCategory; label: string }[] = [
  { value: 'drone_ops', label: 'Drone Operations' },
  { value: 'software_usage', label: 'Software Usage' },
  { value: 'both', label: 'Both' },
];

export const TRAINING_PAYMENT_STATUSES: { value: TrainingPaymentStatus; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'partial', label: 'Partial' },
  { value: 'paid', label: 'Paid' },
];

export const TRAINING_STATUSES: { value: TrainingStatus; label: string }[] = [
  { value: 'requested', label: 'Requested' },
  { value: 'pending', label: 'Pending' },
  { value: 'done', label: 'Done' },
];

export function useTrainings() {
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchTrainings = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("trainings")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      
      const transformedData = (data || []).map(training => ({
        ...training,
        trainee_names: (training.trainee_names || []) as string[],
        pictures: (training.pictures || []) as string[],
      }));
      
      setTrainings(transformedData as Training[]);
    } catch (error: any) {
      console.error("Error fetching trainings:", error);
      toast({
        title: "Error",
        description: "Failed to load trainings",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTrainings();

    const channel = supabase
      .channel("trainings-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "trainings" },
        () => {
          fetchTrainings();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const uploadPictures = async (files: File[], trainingId: string): Promise<string[]> => {
    const uploadedUrls: string[] = [];
    
    for (const file of files) {
      const fileExt = file.name.split('.').pop();
      const fileName = `${trainingId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('training-pictures')
        .upload(fileName, file);
      
      if (uploadError) {
        console.error('Upload error:', uploadError);
        continue;
      }
      
      const { data: { publicUrl } } = supabase.storage
        .from('training-pictures')
        .getPublicUrl(fileName);
      
      uploadedUrls.push(publicUrl);
    }
    
    return uploadedUrls;
  };

  const createTraining = async (
    formData: TrainingFormData, 
    userId: string, 
    userName: string,
    pictureFiles?: File[]
  ) => {
    try {
      const insertData = {
        client_name: formData.client_name,
        city: formData.city,
        model_name: formData.model_name || null,
        type: formData.type,
        category: formData.category,
        no_of_people: formData.no_of_people,
        trainee_names: formData.trainee_names,
        amount_quoted: formData.amount_quoted,
        amount_paid: formData.amount_paid,
        payment_status: formData.payment_status,
        status: formData.status,
        training_date: formData.training_date || null,
        notes: formData.notes || null,
        pictures: [] as string[],
        created_by: userId,
        created_by_name: userName,
      };

      const { data, error } = await supabase
        .from("trainings")
        .insert(insertData)
        .select()
        .single();

      if (error) throw error;

      // Upload pictures if provided
      if (pictureFiles && pictureFiles.length > 0 && data) {
        const uploadedUrls = await uploadPictures(pictureFiles, data.id);
        if (uploadedUrls.length > 0) {
          await supabase
            .from("trainings")
            .update({ pictures: uploadedUrls })
            .eq("id", data.id);
        }
      }

      toast({
        title: "Success",
        description: "Training/Demo created successfully",
      });

      return data;
    } catch (error: any) {
      console.error("Error creating training:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to create training/demo",
        variant: "destructive",
      });
      throw error;
    }
  };

  const updateTraining = async (
    id: string, 
    updates: Partial<TrainingFormData>,
    newPictureFiles?: File[]
  ) => {
    try {
      const updateData: any = { ...updates };

      // Upload new pictures if provided
      if (newPictureFiles && newPictureFiles.length > 0) {
        const uploadedUrls = await uploadPictures(newPictureFiles, id);
        
        // Get existing pictures
        const { data: existing } = await supabase
          .from("trainings")
          .select("pictures")
          .eq("id", id)
          .single();
        
        const existingPictures = (existing?.pictures || []) as string[];
        updateData.pictures = [...existingPictures, ...uploadedUrls];
      }

      const { error } = await supabase
        .from("trainings")
        .update(updateData)
        .eq("id", id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Training/Demo updated successfully",
      });
    } catch (error: any) {
      console.error("Error updating training:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to update training/demo",
        variant: "destructive",
      });
      throw error;
    }
  };

  const deleteTraining = async (id: string) => {
    try {
      const { error } = await supabase.from("trainings").delete().eq("id", id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Training/Demo deleted successfully",
      });
    } catch (error: any) {
      console.error("Error deleting training:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to delete training/demo",
        variant: "destructive",
      });
      throw error;
    }
  };

  const removePicture = async (trainingId: string, pictureUrl: string) => {
    try {
      const { data: existing } = await supabase
        .from("trainings")
        .select("pictures")
        .eq("id", trainingId)
        .single();
      
      const existingPictures = (existing?.pictures || []) as string[];
      const updatedPictures = existingPictures.filter(p => p !== pictureUrl);
      
      await supabase
        .from("trainings")
        .update({ pictures: updatedPictures })
        .eq("id", trainingId);

      toast({
        title: "Success",
        description: "Picture removed successfully",
      });
    } catch (error: any) {
      console.error("Error removing picture:", error);
      toast({
        title: "Error",
        description: "Failed to remove picture",
        variant: "destructive",
      });
    }
  };

  return {
    trainings,
    loading,
    createTraining,
    updateTraining,
    deleteTraining,
    removePicture,
    refetch: fetchTrainings,
  };
}
