-- Create meetings table for tracking meeting requests and scheduled meetings
CREATE TABLE public.meetings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  enquiry_id UUID REFERENCES public.enquiries(id) ON DELETE SET NULL,
  pipeline_id UUID REFERENCES public.pipeline_orders(id) ON DELETE SET NULL,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  meeting_date TIMESTAMP WITH TIME ZONE NOT NULL,
  meeting_type TEXT NOT NULL CHECK (meeting_type IN ('discovery', 'pricing', 'negotiation', 'closing', 'internal')),
  agenda TEXT,
  background TEXT,
  participants TEXT[] DEFAULT '{}',
  owner_id UUID NOT NULL,
  owner_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'scheduled', 'done', 'cancelled')),
  outcome TEXT,
  next_steps TEXT,
  next_followup_date DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view all meetings" 
ON public.meetings 
FOR SELECT 
USING (true);

CREATE POLICY "Authenticated users can create meetings" 
ON public.meetings 
FOR INSERT 
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can update meetings" 
ON public.meetings 
FOR UPDATE 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can delete meetings" 
ON public.meetings 
FOR DELETE 
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role = 'admin'
  )
);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_meetings_updated_at
BEFORE UPDATE ON public.meetings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for meetings table
ALTER PUBLICATION supabase_realtime ADD TABLE public.meetings;

-- Create index for common queries
CREATE INDEX idx_meetings_meeting_date ON public.meetings(meeting_date);
CREATE INDEX idx_meetings_status ON public.meetings(status);
CREATE INDEX idx_meetings_owner_id ON public.meetings(owner_id);
CREATE INDEX idx_meetings_enquiry_id ON public.meetings(enquiry_id);
CREATE INDEX idx_meetings_pipeline_id ON public.meetings(pipeline_id);