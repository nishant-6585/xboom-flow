-- Create task type enum
CREATE TYPE public.task_type AS ENUM (
  'sales_followup',
  'supplier_validation',
  'supplier_onboarding',
  'finance_review',
  'sales_confirmation',
  'hot_lead_followup',
  'mega_deal_review',
  'quotation_request',
  'order_confirmation',
  'custom'
);

-- Create task status enum
CREATE TYPE public.task_status AS ENUM (
  'new',
  'in_progress',
  'awaiting_approval',
  'completed'
);

-- Create tasks table
CREATE TABLE public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Linked records (at least one should be set)
  enquiry_id UUID REFERENCES public.enquiries(id) ON DELETE CASCADE,
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
  pipeline_id UUID REFERENCES public.pipeline_orders(id) ON DELETE CASCADE,
  
  -- Task details
  task_type public.task_type NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  
  -- Assignment
  assigned_to UUID NOT NULL,
  assigned_to_name TEXT NOT NULL,
  assigned_role public.app_role NOT NULL,
  assigned_by UUID,
  assigned_by_name TEXT,
  
  -- Status tracking
  status public.task_status NOT NULL DEFAULT 'new',
  priority INTEGER DEFAULT 3, -- 1=High, 2=Medium, 3=Low
  due_date TIMESTAMPTZ,
  
  -- Workflow chain
  parent_task_id UUID REFERENCES public.tasks(id),
  
  -- Supplier validation specific
  supplier_exists BOOLEAN,
  flagged_as_new_supplier BOOLEAN DEFAULT false,
  
  -- Completion tracking
  completed_at TIMESTAMPTZ,
  completed_by UUID,
  completed_by_name TEXT,
  completion_notes TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create indexes for common queries
CREATE INDEX idx_tasks_assigned_to ON public.tasks(assigned_to);
CREATE INDEX idx_tasks_assigned_role ON public.tasks(assigned_role);
CREATE INDEX idx_tasks_status ON public.tasks(status);
CREATE INDEX idx_tasks_enquiry_id ON public.tasks(enquiry_id);
CREATE INDEX idx_tasks_order_id ON public.tasks(order_id);
CREATE INDEX idx_tasks_pipeline_id ON public.tasks(pipeline_id);
CREATE INDEX idx_tasks_due_date ON public.tasks(due_date);

-- Enable RLS
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can view their own assigned tasks
CREATE POLICY "Users can view own tasks"
ON public.tasks
FOR SELECT
USING (
  is_user_approved(auth.uid()) 
  AND assigned_to = auth.uid()
);

-- Admin can view all tasks
CREATE POLICY "Admin can view all tasks"
ON public.tasks
FOR SELECT
USING (
  is_user_approved(auth.uid()) 
  AND has_role(auth.uid(), 'admin'::app_role)
);

-- Supply chain can view supply chain tasks
CREATE POLICY "Supply chain can view relevant tasks"
ON public.tasks
FOR SELECT
USING (
  is_user_approved(auth.uid()) 
  AND has_role(auth.uid(), 'supply_chain'::app_role)
  AND assigned_role = 'supply_chain'::app_role
);

-- Finance can view finance tasks
CREATE POLICY "Finance can view relevant tasks"
ON public.tasks
FOR SELECT
USING (
  is_user_approved(auth.uid()) 
  AND has_role(auth.uid(), 'finance'::app_role)
  AND assigned_role = 'finance'::app_role
);

-- Users can update their own assigned tasks
CREATE POLICY "Users can update own tasks"
ON public.tasks
FOR UPDATE
USING (
  is_user_approved(auth.uid()) 
  AND assigned_to = auth.uid()
);

-- Admin can update all tasks
CREATE POLICY "Admin can update all tasks"
ON public.tasks
FOR UPDATE
USING (
  is_user_approved(auth.uid()) 
  AND has_role(auth.uid(), 'admin'::app_role)
);

-- Admin can create tasks for anyone
CREATE POLICY "Admin can create tasks"
ON public.tasks
FOR INSERT
WITH CHECK (
  is_user_approved(auth.uid()) 
  AND has_role(auth.uid(), 'admin'::app_role)
);

-- Sales, supply chain can create tasks (for workflow automation)
CREATE POLICY "Approved users can create tasks"
ON public.tasks
FOR INSERT
WITH CHECK (
  is_user_approved(auth.uid())
);

-- Admin can delete tasks
CREATE POLICY "Admin can delete tasks"
ON public.tasks
FOR DELETE
USING (
  is_user_approved(auth.uid()) 
  AND has_role(auth.uid(), 'admin'::app_role)
);

-- Trigger for updated_at
CREATE TRIGGER update_tasks_updated_at
BEFORE UPDATE ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Function to auto-create sales followup task when enquiry is created
CREATE OR REPLACE FUNCTION public.create_enquiry_task()
RETURNS TRIGGER AS $$
BEGIN
  -- Create sales follow-up task assigned to the salesperson
  INSERT INTO public.tasks (
    enquiry_id,
    task_type,
    title,
    description,
    assigned_to,
    assigned_to_name,
    assigned_role,
    priority,
    due_date
  ) VALUES (
    NEW.id,
    'sales_followup'::task_type,
    'Follow up on enquiry: ' || NEW.product_name,
    'Customer: ' || NEW.customer_name || ' (' || NEW.customer_company || ')' ||
    E'\nProduct: ' || NEW.product_name || ' x' || NEW.quantity ||
    E'\nUrgency: ' || NEW.urgency,
    NEW.sales_person_id,
    NEW.sales_person_name,
    'sales'::app_role,
    CASE 
      WHEN NEW.urgency = 'high' THEN 1
      WHEN NEW.urgency = 'medium' THEN 2
      ELSE 3
    END,
    CASE 
      WHEN NEW.urgency = 'high' THEN now() + interval '4 hours'
      WHEN NEW.urgency = 'medium' THEN now() + interval '24 hours'
      ELSE now() + interval '48 hours'
    END
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger for enquiry task creation
CREATE TRIGGER trigger_create_enquiry_task
AFTER INSERT ON public.enquiries
FOR EACH ROW
EXECUTE FUNCTION public.create_enquiry_task();

-- Function to create supplier validation task when enquiry status changes
CREATE OR REPLACE FUNCTION public.create_supplier_validation_task()
RETURNS TRIGGER AS $$
DECLARE
  supply_chain_user RECORD;
BEGIN
  -- When enquiry moves to 'responded' status, create supplier validation task
  IF NEW.status = 'responded' AND (OLD.status IS NULL OR OLD.status != 'responded') THEN
    -- Find a supply chain user (round-robin by least tasks)
    SELECT p.user_id, p.name INTO supply_chain_user
    FROM public.profiles p
    JOIN public.user_roles ur ON p.user_id = ur.user_id
    WHERE ur.role = 'supply_chain' AND p.is_approved = true
    ORDER BY (
      SELECT COUNT(*) FROM public.tasks t 
      WHERE t.assigned_to = p.user_id AND t.status != 'completed'
    ) ASC
    LIMIT 1;
    
    IF supply_chain_user.user_id IS NOT NULL THEN
      INSERT INTO public.tasks (
        enquiry_id,
        task_type,
        title,
        description,
        assigned_to,
        assigned_to_name,
        assigned_role,
        priority,
        due_date
      ) VALUES (
        NEW.id,
        'supplier_validation'::task_type,
        'Validate supplier for: ' || NEW.product_name,
        'Enquiry responded - verify supplier availability' ||
        E'\nProduct: ' || NEW.product_name ||
        E'\nPricing: ' || COALESCE(NEW.response_pricing, 'N/A') ||
        E'\nLead Time: ' || COALESCE(NEW.response_lead_time, 'N/A'),
        supply_chain_user.user_id,
        supply_chain_user.name,
        'supply_chain'::app_role,
        2,
        now() + interval '24 hours'
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger for supplier validation task
CREATE TRIGGER trigger_create_supplier_validation_task
AFTER UPDATE ON public.enquiries
FOR EACH ROW
EXECUTE FUNCTION public.create_supplier_validation_task();

-- Function to create hot lead tasks
CREATE OR REPLACE FUNCTION public.create_hot_lead_task()
RETURNS TRIGGER AS $$
BEGIN
  -- When enquiry is marked as hot lead
  IF NEW.lead_temperature = 'hot' AND (OLD.lead_temperature IS NULL OR OLD.lead_temperature != 'hot') THEN
    INSERT INTO public.tasks (
      enquiry_id,
      task_type,
      title,
      description,
      assigned_to,
      assigned_to_name,
      assigned_role,
      priority,
      due_date
    ) VALUES (
      NEW.id,
      'hot_lead_followup'::task_type,
      '🔥 Hot Lead: ' || NEW.product_name,
      'PRIORITY: Hot lead requires immediate attention!' ||
      E'\nCustomer: ' || NEW.customer_name || ' (' || NEW.customer_company || ')' ||
      E'\nProduct: ' || NEW.product_name,
      NEW.sales_person_id,
      NEW.sales_person_name,
      'sales'::app_role,
      1,
      now() + interval '2 hours'
    );
  END IF;
  
  -- When enquiry is marked as mega deal
  IF NEW.is_mega_deal = true AND (OLD.is_mega_deal IS NULL OR OLD.is_mega_deal = false) THEN
    INSERT INTO public.tasks (
      enquiry_id,
      task_type,
      title,
      description,
      assigned_to,
      assigned_to_name,
      assigned_role,
      priority,
      due_date
    ) VALUES (
      NEW.id,
      'mega_deal_review'::task_type,
      '🌟 Mega Deal: ' || NEW.product_name,
      'MEGA DEAL requires management review!' ||
      E'\nCustomer: ' || NEW.customer_name || ' (' || NEW.customer_company || ')' ||
      E'\nProduct: ' || NEW.product_name,
      NEW.sales_person_id,
      NEW.sales_person_name,
      'sales'::app_role,
      1,
      now() + interval '1 hour'
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger for hot lead tasks
CREATE TRIGGER trigger_create_hot_lead_task
AFTER UPDATE ON public.enquiries
FOR EACH ROW
EXECUTE FUNCTION public.create_hot_lead_task();

-- Function to create follow-up task when a task is completed
CREATE OR REPLACE FUNCTION public.create_followup_task_on_completion()
RETURNS TRIGGER AS $$
DECLARE
  finance_user RECORD;
  sales_user RECORD;
BEGIN
  -- Only process when status changes to 'completed'
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    NEW.completed_at := now();
    
    -- Supplier validation completed -> create finance review task
    IF NEW.task_type = 'supplier_validation' AND NEW.supplier_exists = true THEN
      -- Find a finance user
      SELECT p.user_id, p.name INTO finance_user
      FROM public.profiles p
      JOIN public.user_roles ur ON p.user_id = ur.user_id
      WHERE ur.role = 'finance' AND p.is_approved = true
      ORDER BY (
        SELECT COUNT(*) FROM public.tasks t 
        WHERE t.assigned_to = p.user_id AND t.status != 'completed'
      ) ASC
      LIMIT 1;
      
      IF finance_user.user_id IS NOT NULL THEN
        INSERT INTO public.tasks (
          enquiry_id,
          task_type,
          title,
          description,
          assigned_to,
          assigned_to_name,
          assigned_role,
          priority,
          parent_task_id,
          due_date
        ) VALUES (
          NEW.enquiry_id,
          'finance_review'::task_type,
          'Finance Review: Supplier verified',
          'Supplier has been verified. Please review for finance approval.',
          finance_user.user_id,
          finance_user.name,
          'finance'::app_role,
          2,
          NEW.id,
          now() + interval '24 hours'
        );
      END IF;
    END IF;
    
    -- Supplier validation flagged as new supplier -> create onboarding task
    IF NEW.task_type = 'supplier_validation' AND NEW.flagged_as_new_supplier = true THEN
      INSERT INTO public.tasks (
        enquiry_id,
        task_type,
        title,
        description,
        assigned_to,
        assigned_to_name,
        assigned_role,
        priority,
        parent_task_id,
        due_date
      ) VALUES (
        NEW.enquiry_id,
        'supplier_onboarding'::task_type,
        'New Supplier Onboarding Required',
        'New supplier needs to be onboarded for this enquiry.',
        NEW.assigned_to,
        NEW.assigned_to_name,
        'supply_chain'::app_role,
        1,
        NEW.id,
        now() + interval '48 hours'
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger for follow-up tasks
CREATE TRIGGER trigger_create_followup_task
BEFORE UPDATE ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.create_followup_task_on_completion();

-- Function to get user's task count by status
CREATE OR REPLACE FUNCTION public.get_user_task_counts(p_user_id UUID)
RETURNS TABLE(
  total_tasks BIGINT,
  new_tasks BIGINT,
  in_progress_tasks BIGINT,
  awaiting_approval_tasks BIGINT,
  overdue_tasks BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*)::BIGINT as total_tasks,
    COUNT(*) FILTER (WHERE status = 'new')::BIGINT as new_tasks,
    COUNT(*) FILTER (WHERE status = 'in_progress')::BIGINT as in_progress_tasks,
    COUNT(*) FILTER (WHERE status = 'awaiting_approval')::BIGINT as awaiting_approval_tasks,
    COUNT(*) FILTER (WHERE due_date < now() AND status NOT IN ('completed'))::BIGINT as overdue_tasks
  FROM public.tasks
  WHERE assigned_to = p_user_id AND status != 'completed';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;