-- Add reporting_manager_id to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS reporting_manager_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Create index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_profiles_reporting_manager 
ON public.profiles(reporting_manager_id);

-- Create a function to check if user is the reporting manager of another user
CREATE OR REPLACE FUNCTION public.is_reporting_manager(_manager_id UUID, _employee_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE user_id = _employee_id
      AND reporting_manager_id = _manager_id
  )
$$;

-- Create a function to get all direct reports for a manager
CREATE OR REPLACE FUNCTION public.get_direct_reports(_manager_id UUID)
RETURNS SETOF UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT user_id
  FROM public.profiles
  WHERE reporting_manager_id = _manager_id
$$;

-- Drop existing task view policies that need to be updated
DROP POLICY IF EXISTS "Users can view own tasks" ON public.tasks;
DROP POLICY IF EXISTS "Admin can view all tasks" ON public.tasks;
DROP POLICY IF EXISTS "Finance can view relevant tasks" ON public.tasks;
DROP POLICY IF EXISTS "Supply chain can view relevant tasks" ON public.tasks;

-- Create comprehensive task visibility policy
-- Users can see: their own tasks, tasks of their direct reports
CREATE POLICY "Users can view own and direct reports tasks"
ON public.tasks
FOR SELECT
USING (
  is_user_approved(auth.uid()) AND (
    -- Own tasks
    assigned_to = auth.uid()
    -- OR tasks of direct reports (for managers)
    OR assigned_to IN (SELECT public.get_direct_reports(auth.uid()))
  )
);

-- Admin and HR can see all tasks
CREATE POLICY "Admin can view all tasks"
ON public.tasks
FOR SELECT
USING (
  is_user_approved(auth.uid()) AND 
  has_role(auth.uid(), 'admin'::app_role)
);

-- Finance can view finance-related tasks
CREATE POLICY "Finance can view finance tasks"
ON public.tasks
FOR SELECT
USING (
  is_user_approved(auth.uid()) AND 
  has_role(auth.uid(), 'finance'::app_role) AND 
  assigned_role = 'finance'::app_role
);

-- Supply chain can view supply chain tasks
CREATE POLICY "Supply chain can view supply chain tasks"
ON public.tasks
FOR SELECT
USING (
  is_user_approved(auth.uid()) AND 
  has_role(auth.uid(), 'supply_chain'::app_role) AND 
  assigned_role = 'supply_chain'::app_role
);