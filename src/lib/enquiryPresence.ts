// Tracks which enquiry detail dialog is currently open in the UI.
// Used by toast presenters to suppress notifications for the enquiry
// the user is actively reading.
const openEnquiryIds = new Set<string>();

export function markEnquiryOpen(id: string): void {
  if (!id) return;
  openEnquiryIds.add(id);
}

export function markEnquiryClosed(id: string): void {
  if (!id) return;
  openEnquiryIds.delete(id);
}

export function isEnquiryOpen(id: string): boolean {
  return openEnquiryIds.has(id);
}