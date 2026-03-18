
ALTER TABLE public.tasks DROP CONSTRAINT tasks_parent_task_id_fkey;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_parent_task_id_fkey FOREIGN KEY (parent_task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;
