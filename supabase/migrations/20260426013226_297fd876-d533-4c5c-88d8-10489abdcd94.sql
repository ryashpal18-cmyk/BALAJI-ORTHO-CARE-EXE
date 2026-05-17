-- Match the original app behavior for invoice PDFs: invoices are public links,
-- while writes remain staff/admin controlled.
UPDATE storage.buckets
SET public = true
WHERE id = 'invoices';

DROP POLICY IF EXISTS "Public can view invoices" ON storage.objects;
DROP POLICY IF EXISTS "Staff can upload invoices" ON storage.objects;
DROP POLICY IF EXISTS "Staff can update invoices" ON storage.objects;
DROP POLICY IF EXISTS "Admin can delete invoices" ON storage.objects;

CREATE POLICY "Public can view invoices"
ON storage.objects
FOR SELECT
USING (bucket_id = 'invoices');

CREATE POLICY "Staff can upload invoices"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'invoices' AND public.is_staff(auth.uid()));

CREATE POLICY "Staff can update invoices"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'invoices' AND public.is_staff(auth.uid()));

CREATE POLICY "Admin can delete invoices"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'invoices' AND public.has_role(auth.uid(), 'admin'));