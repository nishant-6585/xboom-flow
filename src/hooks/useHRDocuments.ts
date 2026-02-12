import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export interface HRFolder {
  id: string;
  name: string;
  parent_id: string | null;
  folder_type: string;
  employee_id: string | null;
  created_by: string;
  created_by_name: string;
  created_at: string;
  updated_at: string;
  visibility: string;
}

export interface HRDocument {
  id: string;
  folder_id: string;
  name: string;
  description: string | null;
  file_url: string;
  file_type: string | null;
  file_size: number | null;
  uploaded_by: string;
  uploaded_by_name: string;
  created_at: string;
  updated_at: string;
  visibility: string;
}

export interface ShareRule {
  id: string;
  share_type: 'all' | 'department' | 'individual';
  department: string | null;
  employee_id: string | null;
  created_by: string;
  created_at: string;
}

export interface EmployeeOption {
  id: string;
  name: string;
  department: string;
  user_id: string | null;
}

export function useHRDocuments() {
  const { user, profile, roles } = useAuth();
  const [folders, setFolders] = useState<HRFolder[]>([]);
  const [documents, setDocuments] = useState<HRDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);

  const isHROrAdmin = roles.includes('hr') || roles.includes('admin');

  const fetchEmployees = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('employees')
        .select('id, name, department, user_id')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      const emps = (data || []) as EmployeeOption[];
      setEmployees(emps);
      // Use all system roles as departments plus any unique employee departments
      const systemDepts = ['Admin', 'Sales', 'Supply Chain', 'Finance', 'IT', 'Marketing', 'HR', 'General'];
      const empDepts = emps.map(e => e.department).filter(Boolean);
      const allDepts = [...new Set([...systemDepts, ...empDepts])].sort();
      setDepartments(allDepts);
    } catch (error: any) {
      console.error('Error fetching employees:', error);
    }
  }, [user]);

  const fetchFolders = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('hr_folders')
        .select('*')
        .order('name');
      if (error) throw error;
      setFolders((data || []) as unknown as HRFolder[]);
    } catch (error: any) {
      console.error('Error fetching HR folders:', error);
    }
  }, [user]);

  const fetchDocuments = useCallback(async (folderId?: string) => {
    if (!user) return;
    try {
      let query = supabase
        .from('hr_documents')
        .select('*')
        .order('name');
      if (folderId) {
        query = query.eq('folder_id', folderId);
      }
      const { data, error } = await query;
      if (error) throw error;
      setDocuments((data || []) as unknown as HRDocument[]);
    } catch (error: any) {
      console.error('Error fetching HR documents:', error);
    }
  }, [user]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchFolders(), fetchDocuments(), fetchEmployees()]);
    setLoading(false);
  }, [fetchFolders, fetchDocuments, fetchEmployees]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // Sharing functions
  const fetchFolderShares = async (folderId: string): Promise<ShareRule[]> => {
    try {
      const { data, error } = await supabase
        .from('hr_folder_shares')
        .select('*')
        .eq('folder_id', folderId);
      if (error) throw error;
      return (data || []) as unknown as ShareRule[];
    } catch (error: any) {
      console.error('Error fetching folder shares:', error);
      return [];
    }
  };

  const fetchDocumentShares = async (documentId: string): Promise<ShareRule[]> => {
    try {
      const { data, error } = await supabase
        .from('hr_document_shares')
        .select('*')
        .eq('document_id', documentId);
      if (error) throw error;
      return (data || []) as unknown as ShareRule[];
    } catch (error: any) {
      console.error('Error fetching document shares:', error);
      return [];
    }
  };

  const updateFolderShares = async (folderId: string, shares: Omit<ShareRule, 'id' | 'created_by' | 'created_at'>[]) => {
    if (!user) return;
    try {
      // Delete existing shares
      await supabase.from('hr_folder_shares').delete().eq('folder_id', folderId);
      
      // Determine visibility
      const visibility = shares.length === 0 ? 'private' : 'shared';
      
      // Insert new shares
      if (shares.length > 0) {
        const rows = shares.map(s => ({
          folder_id: folderId,
          share_type: s.share_type,
          department: s.department,
          employee_id: s.employee_id,
          created_by: user.id,
        }));
        const { error } = await supabase.from('hr_folder_shares').insert(rows);
        if (error) throw error;
      }
      
      // Update visibility on folder
      await supabase.from('hr_folders').update({ visibility }).eq('id', folderId);
      
      toast.success('Folder sharing updated');
      await fetchFolders();
    } catch (error: any) {
      console.error('Error updating folder shares:', error);
      toast.error(error.message || 'Failed to update sharing');
    }
  };

  const updateDocumentShares = async (documentId: string, shares: Omit<ShareRule, 'id' | 'created_by' | 'created_at'>[]) => {
    if (!user) return;
    try {
      await supabase.from('hr_document_shares').delete().eq('document_id', documentId);
      
      const visibility = shares.length === 0 ? 'private' : 'shared';
      
      if (shares.length > 0) {
        const rows = shares.map(s => ({
          document_id: documentId,
          share_type: s.share_type,
          department: s.department,
          employee_id: s.employee_id,
          created_by: user.id,
        }));
        const { error } = await supabase.from('hr_document_shares').insert(rows);
        if (error) throw error;
      }
      
      await supabase.from('hr_documents').update({ visibility }).eq('id', documentId);
      
      toast.success('Document sharing updated');
      await fetchDocuments();
    } catch (error: any) {
      console.error('Error updating document shares:', error);
      toast.error(error.message || 'Failed to update sharing');
    }
  };

  const createFolder = async (name: string, parentId: string | null, folderType: string, employeeId?: string | null) => {
    if (!user || !profile) return;
    try {
      const { error } = await supabase.from('hr_folders').insert({
        name,
        parent_id: parentId,
        folder_type: folderType,
        employee_id: employeeId || null,
        created_by: user.id,
        created_by_name: profile.name,
        visibility: 'private',
      });
      if (error) throw error;
      toast.success('Folder created');
      await fetchFolders();
    } catch (error: any) {
      console.error('Error creating folder:', error);
      toast.error(error.message || 'Failed to create folder');
    }
  };

  const renameFolder = async (folderId: string, newName: string) => {
    try {
      const { error } = await supabase
        .from('hr_folders')
        .update({ name: newName })
        .eq('id', folderId);
      if (error) throw error;
      toast.success('Folder renamed');
      await fetchFolders();
    } catch (error: any) {
      toast.error(error.message || 'Failed to rename folder');
    }
  };

  const deleteFolder = async (folderId: string) => {
    try {
      const { error } = await supabase
        .from('hr_folders')
        .delete()
        .eq('id', folderId);
      if (error) throw error;
      toast.success('Folder deleted');
      await fetchAll();
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete folder');
    }
  };

  const uploadDocument = async (folderId: string, file: File, description?: string) => {
    if (!user || !profile) return;
    try {
      const fileExt = file.name.split('.').pop();
      const filePath = `${folderId}/${Date.now()}_${file.name}`;

      const { error: uploadError } = await supabase.storage
        .from('hr-documents')
        .upload(filePath, file);
      if (uploadError) throw uploadError;

      const { error: dbError } = await supabase.from('hr_documents').insert({
        folder_id: folderId,
        name: file.name,
        description: description || null,
        file_url: filePath,
        file_type: fileExt || null,
        file_size: file.size,
        uploaded_by: user.id,
        uploaded_by_name: profile.name,
        visibility: 'private',
      });
      if (dbError) throw dbError;

      toast.success('Document uploaded');
      await fetchDocuments();
    } catch (error: any) {
      console.error('Error uploading document:', error);
      toast.error(error.message || 'Failed to upload document');
    }
  };

  const deleteDocument = async (docId: string, filePath: string) => {
    try {
      await supabase.storage.from('hr-documents').remove([filePath]);
      const { error } = await supabase
        .from('hr_documents')
        .delete()
        .eq('id', docId);
      if (error) throw error;
      toast.success('Document deleted');
      await fetchDocuments();
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete document');
    }
  };

  const renameDocument = async (docId: string, newName: string) => {
    try {
      const { error } = await supabase
        .from('hr_documents')
        .update({ name: newName })
        .eq('id', docId);
      if (error) throw error;
      toast.success('Document renamed');
      await fetchDocuments();
    } catch (error: any) {
      toast.error(error.message || 'Failed to rename document');
    }
  };

  const moveDocument = async (docId: string, newFolderId: string) => {
    try {
      const { error } = await supabase
        .from('hr_documents')
        .update({ folder_id: newFolderId })
        .eq('id', docId);
      if (error) throw error;
      toast.success('Document moved');
      await fetchDocuments();
    } catch (error: any) {
      toast.error(error.message || 'Failed to move document');
    }
  };

  const getSignedUrl = async (filePath: string): Promise<string | null> => {
    try {
      const { data, error } = await supabase.storage
        .from('hr-documents')
        .createSignedUrl(filePath, 3600);
      if (error) throw error;
      return data.signedUrl;
    } catch (error: any) {
      console.error('Error getting signed URL:', error);
      toast.error('Failed to load document');
      return null;
    }
  };

  return {
    folders,
    documents,
    loading,
    isHROrAdmin,
    employees,
    departments,
    createFolder,
    renameFolder,
    deleteFolder,
    uploadDocument,
    deleteDocument,
    renameDocument,
    moveDocument,
    getSignedUrl,
    fetchDocuments,
    fetchAll,
    fetchFolderShares,
    fetchDocumentShares,
    updateFolderShares,
    updateDocumentShares,
  };
}
