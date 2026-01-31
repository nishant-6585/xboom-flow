-- Add new values to the training_category enum
ALTER TYPE training_category ADD VALUE IF NOT EXISTS 'das';
ALTER TYPE training_category ADD VALUE IF NOT EXISTS 'ras';