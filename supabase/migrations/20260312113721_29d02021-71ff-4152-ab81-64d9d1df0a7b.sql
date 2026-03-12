CREATE OR REPLACE FUNCTION public.log_candidate_audit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.final_status IS DISTINCT FROM NEW.final_status THEN
    INSERT INTO public.edit_history (table_name, record_id, field_name, old_value, new_value, edited_by, edited_by_name)
    VALUES ('candidates', NEW.id, 'final_status', OLD.final_status::text, NEW.final_status::text, 
            auth.uid(), COALESCE((SELECT name FROM public.profiles WHERE user_id = auth.uid()), 'System'));
  END IF;
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.edit_history (table_name, record_id, field_name, old_value, new_value, edited_by, edited_by_name)
    VALUES ('candidates', NEW.id, 'status', OLD.status::text, NEW.status::text,
            auth.uid(), COALESCE((SELECT name FROM public.profiles WHERE user_id = auth.uid()), 'System'));
  END IF;
  IF OLD.offer_letter_issued IS DISTINCT FROM NEW.offer_letter_issued THEN
    INSERT INTO public.edit_history (table_name, record_id, field_name, old_value, new_value, edited_by, edited_by_name)
    VALUES ('candidates', NEW.id, 'offer_letter_issued', OLD.offer_letter_issued::text, NEW.offer_letter_issued::text,
            auth.uid(), COALESCE((SELECT name FROM public.profiles WHERE user_id = auth.uid()), 'System'));
  END IF;
  IF OLD.joining_date IS DISTINCT FROM NEW.joining_date THEN
    INSERT INTO public.edit_history (table_name, record_id, field_name, old_value, new_value, edited_by, edited_by_name)
    VALUES ('candidates', NEW.id, 'joining_date', OLD.joining_date::text, NEW.joining_date::text,
            auth.uid(), COALESCE((SELECT name FROM public.profiles WHERE user_id = auth.uid()), 'System'));
  END IF;
  RETURN NEW;
END;
$function$;