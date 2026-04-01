
INSERT INTO storage.buckets (id, name, public)
VALUES ('training-uploads', 'training-uploads', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Allow authenticated uploads to training-uploads"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'training-uploads');

CREATE POLICY "Allow public read from training-uploads"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'training-uploads');

CREATE POLICY "Allow authenticated delete from training-uploads"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'training-uploads');
