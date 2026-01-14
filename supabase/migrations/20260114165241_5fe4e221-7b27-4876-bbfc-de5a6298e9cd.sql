
-- Create a function to generate meeting reminder tasks for participants
CREATE OR REPLACE FUNCTION public.create_meeting_reminder_tasks()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  participant_id UUID;
  participant_name TEXT;
  meeting_brief TEXT;
  lead_info TEXT;
BEGIN
  -- Only process when meeting is scheduled (new insert with scheduled status, or status changed to scheduled)
  IF NEW.status = 'scheduled' AND (TG_OP = 'INSERT' OR OLD.status IS NULL OR OLD.status != 'scheduled') THEN
    
    -- Build lead info if available
    lead_info := '';
    IF NEW.enquiry_id IS NOT NULL THEN
      SELECT 'Lead: ' || customer_name || ' (' || customer_company || ') - ' || product_name
      INTO lead_info
      FROM public.enquiries WHERE id = NEW.enquiry_id;
    ELSIF NEW.pipeline_id IS NOT NULL THEN
      SELECT 'Pipeline: ' || customer_name || ' (' || customer_company || ') - ' || product_name
      INTO lead_info
      FROM public.pipeline_orders WHERE id = NEW.pipeline_id;
    END IF;
    
    -- Build meeting brief
    meeting_brief := 'Meeting Type: ' || COALESCE(NEW.meeting_type, 'N/A') ||
      E'\nDate & Time: ' || to_char(NEW.meeting_date, 'DD Mon YYYY at HH24:MI') ||
      E'\nHost: ' || COALESCE(NEW.host_name, NEW.owner_name);
    
    IF NEW.meeting_link IS NOT NULL AND NEW.meeting_link != '' THEN
      meeting_brief := meeting_brief || E'\nMeeting Link: ' || NEW.meeting_link;
    END IF;
    
    IF lead_info != '' THEN
      meeting_brief := meeting_brief || E'\n' || lead_info;
    END IF;
    
    IF NEW.agenda IS NOT NULL AND NEW.agenda != '' THEN
      meeting_brief := meeting_brief || E'\nAgenda: ' || NEW.agenda;
    END IF;
    
    -- Create task for each participant
    IF NEW.participants IS NOT NULL AND array_length(NEW.participants, 1) > 0 THEN
      FOREACH participant_id IN ARRAY NEW.participants
      LOOP
        -- Get participant name
        SELECT name INTO participant_name
        FROM public.profiles WHERE user_id = participant_id;
        
        -- Create reminder task
        INSERT INTO public.tasks (
          task_type,
          title,
          description,
          assigned_to,
          assigned_to_name,
          assigned_role,
          priority,
          due_date,
          meeting_id
        ) VALUES (
          'meeting_reminder'::task_type,
          '📅 Meeting Reminder: ' || COALESCE(NEW.meeting_type, 'Meeting') || ' on ' || to_char(NEW.meeting_date, 'DD Mon'),
          meeting_brief,
          participant_id,
          COALESCE(participant_name, 'Unknown'),
          'sales'::app_role,
          2,
          NEW.meeting_date - interval '1 hour', -- Due 1 hour before meeting
          NEW.id
        );
      END LOOP;
    END IF;
    
    -- Also create task for host if different from owner
    IF NEW.host_id IS NOT NULL AND NEW.host_id != NEW.owner_id THEN
      INSERT INTO public.tasks (
        task_type,
        title,
        description,
        assigned_to,
        assigned_to_name,
        assigned_role,
        priority,
        due_date,
        meeting_id
      ) VALUES (
        'meeting_reminder'::task_type,
        '📅 You are hosting: ' || COALESCE(NEW.meeting_type, 'Meeting') || ' on ' || to_char(NEW.meeting_date, 'DD Mon'),
        meeting_brief,
        NEW.host_id,
        COALESCE(NEW.host_name, 'Unknown'),
        'sales'::app_role,
        1, -- Higher priority for host
        NEW.meeting_date - interval '1 hour',
        NEW.id
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Add meeting_id column to tasks table to link tasks to meetings
ALTER TABLE public.tasks
ADD COLUMN IF NOT EXISTS meeting_id UUID REFERENCES public.meetings(id) ON DELETE CASCADE;

-- Add meeting_reminder to task_type enum if not exists
DO $$ BEGIN
  ALTER TYPE task_type ADD VALUE IF NOT EXISTS 'meeting_reminder';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Create trigger for meeting reminder tasks
DROP TRIGGER IF EXISTS trigger_create_meeting_reminder_tasks ON public.meetings;
CREATE TRIGGER trigger_create_meeting_reminder_tasks
  AFTER INSERT OR UPDATE ON public.meetings
  FOR EACH ROW
  EXECUTE FUNCTION public.create_meeting_reminder_tasks();
