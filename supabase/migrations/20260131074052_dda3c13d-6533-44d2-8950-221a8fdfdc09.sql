-- Create a table to store user invitations
CREATE TABLE public.user_invitations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'sales',
  status TEXT NOT NULL DEFAULT 'pending',
  invited_by UUID REFERENCES auth.users(id),
  invited_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  accepted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT valid_role CHECK (role IN ('sales', 'supply_chain', 'finance', 'admin')),
  CONSTRAINT valid_status CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled'))
);

-- Enable RLS
ALTER TABLE public.user_invitations ENABLE ROW LEVEL SECURITY;

-- Only admins can view invitations
CREATE POLICY "Admins can view all invitations"
ON public.user_invitations
FOR SELECT
USING (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

-- Only admins can create invitations
CREATE POLICY "Admins can create invitations"
ON public.user_invitations
FOR INSERT
WITH CHECK (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

-- Only admins can update invitations
CREATE POLICY "Admins can update invitations"
ON public.user_invitations
FOR UPDATE
USING (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

-- Only admins can delete invitations
CREATE POLICY "Admins can delete invitations"
ON public.user_invitations
FOR DELETE
USING (is_user_approved(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

-- Create trigger for updated_at
CREATE TRIGGER update_user_invitations_updated_at
BEFORE UPDATE ON public.user_invitations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();