-- Create enum for training type
CREATE TYPE public.training_type AS ENUM ('demo', 'training');

-- Create enum for training category
CREATE TYPE public.training_category AS ENUM ('drone_ops', 'software_usage', 'both');

-- Create enum for training payment status
CREATE TYPE public.training_payment_status AS ENUM ('pending', 'partial', 'paid');

-- Create trainings table
CREATE TABLE public.trainings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  training_number TEXT UNIQUE,
  client_name TEXT NOT NULL,
  city TEXT NOT NULL,
  model_name TEXT,
  type training_type NOT NULL DEFAULT 'training',
  category training_category NOT NULL DEFAULT 'drone_ops',
  no_of_people INTEGER DEFAULT 1,
  trainee_names TEXT[],
  amount_quoted NUMERIC(10,2) DEFAULT 0,
  amount_paid NUMERIC(10,2) DEFAULT 0,
  payment_status training_payment_status NOT NULL DEFAULT 'pending',
  training_date DATE,
  pictures TEXT[],
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_by_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.trainings ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Approved users can view trainings"
ON public.trainings FOR SELECT
USING (is_user_approved(auth.uid()));

CREATE POLICY "Approved users can create trainings"
ON public.trainings FOR INSERT
WITH CHECK (is_user_approved(auth.uid()));

CREATE POLICY "Approved users can update trainings"
ON public.trainings FOR UPDATE
USING (is_user_approved(auth.uid()));

CREATE POLICY "Admins can delete trainings"
ON public.trainings FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create trigger for updated_at
CREATE TRIGGER update_trainings_updated_at
BEFORE UPDATE ON public.trainings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to generate training number
CREATE OR REPLACE FUNCTION public.generate_training_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  next_num INTEGER;
  year_prefix TEXT;
  new_training_number TEXT;
BEGIN
  IF NEW.training_number IS NULL THEN
    year_prefix := TO_CHAR(NOW(), 'YY');
    
    LOCK TABLE public.trainings IN SHARE ROW EXCLUSIVE MODE;
    
    SELECT COALESCE(
      MAX(
        CASE 
          WHEN training_number ~ ('^TRN' || year_prefix || '[0-9]+$') 
          THEN CAST(SUBSTRING(training_number FROM 6) AS INTEGER)
          ELSE 0
        END
      ), 0
    ) + 1
    INTO next_num
    FROM public.trainings
    WHERE training_number LIKE 'TRN' || year_prefix || '%';
    
    new_training_number := 'TRN' || year_prefix || LPAD(next_num::TEXT, 5, '0');
    
    WHILE EXISTS (SELECT 1 FROM public.trainings WHERE training_number = new_training_number) LOOP
      next_num := next_num + 1;
      new_training_number := 'TRN' || year_prefix || LPAD(next_num::TEXT, 5, '0');
    END LOOP;
    
    NEW.training_number := new_training_number;
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger for training number generation
CREATE TRIGGER generate_training_number_trigger
BEFORE INSERT ON public.trainings
FOR EACH ROW
EXECUTE FUNCTION public.generate_training_number();

-- Create storage bucket for training pictures
INSERT INTO storage.buckets (id, name, public) VALUES ('training-pictures', 'training-pictures', true);

-- Create storage policies for training pictures
CREATE POLICY "Anyone can view training pictures"
ON storage.objects FOR SELECT
USING (bucket_id = 'training-pictures');

CREATE POLICY "Approved users can upload training pictures"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'training-pictures' AND is_user_approved(auth.uid()));

CREATE POLICY "Approved users can update training pictures"
ON storage.objects FOR UPDATE
USING (bucket_id = 'training-pictures' AND is_user_approved(auth.uid()));

CREATE POLICY "Approved users can delete training pictures"
ON storage.objects FOR DELETE
USING (bucket_id = 'training-pictures' AND is_user_approved(auth.uid()));