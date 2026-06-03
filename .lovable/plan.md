# Implementation Process Section — HR Portal

Add a new "Process Docs" tab under the HR portal where HR/Admin can upload, organize, and share internal process documents (SOPs, policies, manuals, etc.) for company-wide reference.

## Scope

- New tab `Process Docs` in `src/pages/HR.tsx` (visible to all employees; upload/edit/delete restricted to HR/Admin).
- Dedicated panel listing process documents with search, category filter, preview, and download.
- Private storage bucket with signed URLs (no public access).
- Activity logged to existing audit/domain events.

## Data Model

New table `public.hr_process_documents`:
- `title` (text, required)
- `description` (text, optional)
- `category` (text — e.g. Onboarding, Payroll, IT, Sales, Finance, General)
- `file_path` (text — storage key in `hr-process-docs` bucket)
- `file_name`, `file_size`, `mime_type`
- `version` (int, default 1) + `is_active` (bool, default true) to support new versions while keeping history
- `uploaded_by` (uuid → profiles), standard `created_at` / `updated_at`

RLS:
- SELECT: all authenticated employees (`is_active = true` rows only for non-HR/Admin; HR/Admin see all)
- INSERT / UPDATE / DELETE: only `has_role(auth.uid(), 'admin')` or `has_role(auth.uid(), 'hr')`
- GRANTs to `authenticated` and `service_role`

## Storage

- New private bucket `hr-process-docs` (created via storage tool)
- RLS on `storage.objects`:
  - SELECT: authenticated users (read via signed URLs only)
  - INSERT / UPDATE / DELETE: HR/Admin only
- Reuse `validateFile` with new `documents` context (already permits PDF/Word/Excel/PowerPoint/images, 20 MB cap)

## UI

New file `src/components/hr/ProcessDocumentsPanel.tsx`:
- Header with search box + category filter dropdown + "Upload Document" button (HR/Admin only)
- Card grid: title, category badge, description, uploaded-by + date, version, file size
- Actions per card: Preview (opens signed URL in new tab), Download, Replace/New Version (HR/Admin), Edit metadata (HR/Admin), Delete (HR/Admin, soft via `is_active=false`)
- Upload dialog: title, category (select with predefined + custom), description, file picker (validated via `validateFile`)
- Empty state with friendly illustration/text

New hook `src/hooks/useProcessDocuments.ts`:
- `listDocuments({ search, category })`
- `uploadDocument({ title, category, description, file })` — uploads to bucket, inserts row
- `replaceDocument(id, file)` — bumps version, keeps history
- `updateMetadata(id, patch)`
- `softDelete(id)`
- `getSignedUrl(path)` — 5-min TTL

Wire into `src/pages/HR.tsx`:
- New `TabsTrigger value="process_docs"` with `FolderOpen`/`BookOpen` icon (visible to everyone)
- New `TabsContent value="process_docs"><ProcessDocumentsPanel /></TabsContent>`

## Security

- Bucket is private; access strictly via short-lived signed URLs
- Server-side RLS enforces HR/Admin gate for writes (no client-side trust)
- File type + size validated client-side and bucket policies as defense-in-depth
- Filename sanitized; storage path: `{category}/{uuid}-{safeName}`
- Domain event written on upload/replace/delete for audit trail

## Out of scope (can follow later if needed)

- Per-department visibility (start with company-wide read)
- In-browser PDF/Office viewer (use new-tab preview via signed URL initially)
- Comments / acknowledgements ("I have read this") workflow
