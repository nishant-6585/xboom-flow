
ALTER TABLE public.employees DISABLE TRIGGER USER;
ALTER TABLE public.profiles DISABLE TRIGGER USER;

UPDATE public.employees
   SET user_id = NULL,
       is_active = false,
       employment_status = 'terminated'
 WHERE user_id = 'e05f9afe-0160-4956-bb1f-496028386062'
    OR name ILIKE 'Arjav%chauhan%';

UPDATE public.profiles
   SET is_approved = false
 WHERE user_id = 'e05f9afe-0160-4956-bb1f-496028386062';

DELETE FROM public.user_roles WHERE user_id = 'e05f9afe-0160-4956-bb1f-496028386062';

ALTER TABLE public.employees ENABLE TRIGGER USER;
ALTER TABLE public.profiles ENABLE TRIGGER USER;

DELETE FROM auth.users WHERE id = 'e05f9afe-0160-4956-bb1f-496028386062';
