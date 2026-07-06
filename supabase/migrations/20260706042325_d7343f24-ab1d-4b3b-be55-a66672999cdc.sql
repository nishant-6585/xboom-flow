
UPDATE public.zoho_books_invoices
   SET match_status = 'matched'
 WHERE linked_order_id IS NOT NULL
   AND match_status = 'pending'
   AND COALESCE(status,'') <> 'void';

UPDATE public.zoho_books_invoices
   SET match_status = 'void'
 WHERE status = 'void'
   AND COALESCE(match_status,'') <> 'void';
