import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export interface LeadTag {
  id: string;
  name: string;
  color: string;
  description: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
}

export interface EnquiryTag {
  id: string;
  enquiry_id: string;
  tag_id: string | null;
  custom_tag: string | null;
  added_by: string | null;
  added_at: string;
  tag?: LeadTag;
}

export interface PipelineTag {
  id: string;
  pipeline_order_id: string;
  tag_id: string | null;
  custom_tag: string | null;
  added_by: string | null;
  added_at: string;
  tag?: LeadTag;
}

export function useLeadTags() {
  const { user, role } = useAuth();
  const [tags, setTags] = useState<LeadTag[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTags = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('lead_tags')
        .select('*')
        .order('name', { ascending: true });

      if (error) throw error;
      setTags((data as LeadTag[]) || []);
    } catch (error: any) {
      console.error('Error fetching lead tags:', error);
      toast.error('Failed to fetch lead tags');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTags();
  }, [fetchTags]);

  const createTag = async (name: string, color: string, description?: string): Promise<boolean> => {
    if (!user || role !== 'admin') {
      toast.error('Only admins can create tags');
      return false;
    }

    try {
      const { error } = await supabase.from('lead_tags').insert({
        name,
        color,
        description: description || null,
        created_by: user.id,
      });

      if (error) throw error;
      toast.success('Tag created successfully');
      fetchTags();
      return true;
    } catch (error: any) {
      console.error('Error creating tag:', error);
      toast.error(error.message || 'Failed to create tag');
      return false;
    }
  };

  const updateTag = async (id: string, updates: Partial<LeadTag>): Promise<boolean> => {
    if (!user || role !== 'admin') {
      toast.error('Only admins can update tags');
      return false;
    }

    try {
      const { error } = await supabase
        .from('lead_tags')
        .update(updates)
        .eq('id', id);

      if (error) throw error;
      toast.success('Tag updated successfully');
      fetchTags();
      return true;
    } catch (error: any) {
      console.error('Error updating tag:', error);
      toast.error(error.message || 'Failed to update tag');
      return false;
    }
  };

  const deleteTag = async (id: string): Promise<boolean> => {
    if (!user || role !== 'admin') {
      toast.error('Only admins can delete tags');
      return false;
    }

    try {
      const { error } = await supabase
        .from('lead_tags')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Tag deleted successfully');
      fetchTags();
      return true;
    } catch (error: any) {
      console.error('Error deleting tag:', error);
      toast.error(error.message || 'Failed to delete tag');
      return false;
    }
  };

  // Enquiry tag operations
  const addEnquiryTag = async (enquiryId: string, tagId?: string, customTag?: string): Promise<boolean> => {
    if (!user) return false;

    try {
      const { error } = await supabase.from('enquiry_tags').insert({
        enquiry_id: enquiryId,
        tag_id: tagId || null,
        custom_tag: customTag || null,
        added_by: user.id,
      });

      if (error) throw error;
      return true;
    } catch (error: any) {
      console.error('Error adding enquiry tag:', error);
      toast.error(error.message || 'Failed to add tag');
      return false;
    }
  };

  const removeEnquiryTag = async (tagRecordId: string): Promise<boolean> => {
    if (!user) return false;

    try {
      const { error } = await supabase
        .from('enquiry_tags')
        .delete()
        .eq('id', tagRecordId);

      if (error) throw error;
      return true;
    } catch (error: any) {
      console.error('Error removing enquiry tag:', error);
      toast.error(error.message || 'Failed to remove tag');
      return false;
    }
  };

  const getEnquiryTags = async (enquiryId: string): Promise<EnquiryTag[]> => {
    try {
      const { data, error } = await supabase
        .from('enquiry_tags')
        .select('*, lead_tags(*)')
        .eq('enquiry_id', enquiryId);

      if (error) throw error;
      
      return (data || []).map((item: any) => ({
        ...item,
        tag: item.lead_tags,
      }));
    } catch (error) {
      console.error('Error fetching enquiry tags:', error);
      return [];
    }
  };

  // Pipeline tag operations
  const addPipelineTag = async (pipelineOrderId: string, tagId?: string, customTag?: string): Promise<boolean> => {
    if (!user) return false;

    try {
      const { error } = await supabase.from('pipeline_tags').insert({
        pipeline_order_id: pipelineOrderId,
        tag_id: tagId || null,
        custom_tag: customTag || null,
        added_by: user.id,
      });

      if (error) throw error;
      return true;
    } catch (error: any) {
      console.error('Error adding pipeline tag:', error);
      toast.error(error.message || 'Failed to add tag');
      return false;
    }
  };

  const removePipelineTag = async (tagRecordId: string): Promise<boolean> => {
    if (!user) return false;

    try {
      const { error } = await supabase
        .from('pipeline_tags')
        .delete()
        .eq('id', tagRecordId);

      if (error) throw error;
      return true;
    } catch (error: any) {
      console.error('Error removing pipeline tag:', error);
      toast.error(error.message || 'Failed to remove tag');
      return false;
    }
  };

  const getPipelineTags = async (pipelineOrderId: string): Promise<PipelineTag[]> => {
    try {
      const { data, error } = await supabase
        .from('pipeline_tags')
        .select('*, lead_tags(*)')
        .eq('pipeline_order_id', pipelineOrderId);

      if (error) throw error;
      
      return (data || []).map((item: any) => ({
        ...item,
        tag: item.lead_tags,
      }));
    } catch (error) {
      console.error('Error fetching pipeline tags:', error);
      return [];
    }
  };

  return {
    tags,
    loading,
    createTag,
    updateTag,
    deleteTag,
    addEnquiryTag,
    removeEnquiryTag,
    getEnquiryTags,
    addPipelineTag,
    removePipelineTag,
    getPipelineTags,
    refetch: fetchTags,
  };
}
