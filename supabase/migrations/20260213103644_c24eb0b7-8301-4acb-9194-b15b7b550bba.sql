
-- Create storage bucket for form attachments
INSERT INTO storage.buckets (id, name, public) VALUES ('form-attachments', 'form-attachments', true)
ON CONFLICT (id) DO NOTHING;

-- Allow anyone to upload to form-attachments bucket (public forms)
CREATE POLICY "Anyone can upload form attachments"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'form-attachments');

-- Allow anyone to read form attachments
CREATE POLICY "Anyone can read form attachments"
ON storage.objects FOR SELECT
USING (bucket_id = 'form-attachments');
