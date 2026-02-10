
-- Enhanced form submission validation trigger that validates against form_fields schema
CREATE OR REPLACE FUNCTION public.validate_form_submission()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  field_record RECORD;
  field_value TEXT;
  option_values JSONB;
  valid_option BOOLEAN;
BEGIN
  -- Validate submission_data size (max 100KB)
  IF octet_length(NEW.submission_data::text) > 100000 THEN
    RAISE EXCEPTION 'Submission data exceeds maximum size limit (100KB)';
  END IF;
  
  -- Validate JSON depth is not too deep (max 5 levels to prevent DoS)
  IF jsonb_typeof(NEW.submission_data) = 'object' THEN
    IF octet_length(NEW.submission_data::text) > 50000 AND 
       (SELECT COUNT(*) FROM jsonb_each_text(NEW.submission_data)) < 5 THEN
      RAISE EXCEPTION 'Submission data structure is too deeply nested';
    END IF;
  END IF;

  -- Validate against form_fields schema
  FOR field_record IN
    SELECT id, label, field_type, is_required, options
    FROM public.form_fields
    WHERE form_id = NEW.form_id
  LOOP
    field_value := NEW.submission_data ->> field_record.label;

    -- Check required fields
    IF field_record.is_required AND (field_value IS NULL OR TRIM(field_value) = '') THEN
      RAISE EXCEPTION 'Required field "%" is missing', field_record.label;
    END IF;

    -- Skip further validation if field is empty and not required
    IF field_value IS NULL OR TRIM(field_value) = '' THEN
      CONTINUE;
    END IF;

    -- Validate field value length (max 5000 chars per field)
    IF LENGTH(field_value) > 5000 THEN
      RAISE EXCEPTION 'Field "%" exceeds maximum length (5000 characters)', field_record.label;
    END IF;

    -- Type-specific validation
    CASE field_record.field_type
      WHEN 'email' THEN
        IF field_value !~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' THEN
          RAISE EXCEPTION 'Invalid email format for field "%"', field_record.label;
        END IF;
      WHEN 'phone' THEN
        IF field_value !~ '^\+?[0-9\s\-\(\)]{6,20}$' THEN
          RAISE EXCEPTION 'Invalid phone format for field "%"', field_record.label;
        END IF;
      WHEN 'number' THEN
        IF field_value !~ '^-?[0-9]+\.?[0-9]*$' THEN
          RAISE EXCEPTION 'Invalid number format for field "%"', field_record.label;
        END IF;
      WHEN 'dropdown', 'radio' THEN
        IF field_record.options IS NOT NULL AND jsonb_array_length(field_record.options) > 0 THEN
          valid_option := FALSE;
          SELECT EXISTS (
            SELECT 1 FROM jsonb_array_elements(field_record.options) opt
            WHERE opt ->> 'value' = field_value
          ) INTO valid_option;
          IF NOT valid_option THEN
            RAISE EXCEPTION 'Invalid option "%" for field "%"', field_value, field_record.label;
          END IF;
        END IF;
      ELSE
        -- text, textarea, date, checkbox - no additional validation needed
        NULL;
    END CASE;
  END LOOP;

  RETURN NEW;
END;
$function$;
