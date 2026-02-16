
-- Create org_departments table for dynamic department management
CREATE TABLE public.org_departments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed with existing departments
INSERT INTO public.org_departments (name) VALUES
  ('General'), ('Sales'), ('HR'), ('Finance'), ('IT'), ('Marketing'), ('Supply Chain'), ('Operations');

-- Enable RLS
ALTER TABLE public.org_departments ENABLE ROW LEVEL SECURITY;

-- Everyone can read departments
CREATE POLICY "Authenticated users can view departments"
  ON public.org_departments FOR SELECT
  TO authenticated
  USING (true);

-- Only admins can manage departments
CREATE POLICY "Admins can insert departments"
  ON public.org_departments FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update departments"
  ON public.org_departments FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete departments"
  ON public.org_departments FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Create org_roles table for dynamic role management
CREATE TABLE public.org_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  is_system BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed with existing system roles
INSERT INTO public.org_roles (name, label, is_system) VALUES
  ('sales', 'Sales Team', true),
  ('supply_chain', 'Supply Chain', true),
  ('finance', 'Finance', true),
  ('admin', 'Admin', true),
  ('it', 'IT Team', true),
  ('marketing', 'Marketing Team', true),
  ('hr', 'HR Team', true);

-- Enable RLS
ALTER TABLE public.org_roles ENABLE ROW LEVEL SECURITY;

-- Everyone can read roles
CREATE POLICY "Authenticated users can view roles"
  ON public.org_roles FOR SELECT
  TO authenticated
  USING (true);

-- Only admins can manage roles
CREATE POLICY "Admins can insert roles"
  ON public.org_roles FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update roles"
  ON public.org_roles FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete roles"
  ON public.org_roles FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') AND is_system = false);

-- Trigger for updated_at
CREATE TRIGGER update_org_departments_updated_at
  BEFORE UPDATE ON public.org_departments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_org_roles_updated_at
  BEFORE UPDATE ON public.org_roles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
