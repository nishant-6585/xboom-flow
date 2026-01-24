-- Create enum for training status
CREATE TYPE public.training_status AS ENUM ('requested', 'pending', 'done');

-- Add status column to trainings table
ALTER TABLE public.trainings 
ADD COLUMN status public.training_status NOT NULL DEFAULT 'requested';