/**
 * Centralized file upload validation utility.
 * All client-side uploads must pass through these checks before uploading to storage.
 */

// Allowed MIME types per bucket context
const ALLOWED_TYPES: Record<string, string[]> = {
  avatars: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  signatures: ['image/jpeg', 'image/png', 'image/webp'],
  images: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  documents: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/jpeg',
    'image/png',
    'image/webp',
  ],
  screenshots: ['image/jpeg', 'image/png', 'image/webp'],
  invoices: [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
  ],
  imports: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'image/jpeg',
    'image/png',
  ],
  cvs: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
};

// Max sizes per context (in bytes)
const MAX_SIZES: Record<string, number> = {
  avatars: 2 * 1024 * 1024,       // 2MB
  signatures: 5 * 1024 * 1024,    // 5MB
  images: 10 * 1024 * 1024,       // 10MB
  documents: 20 * 1024 * 1024,    // 20MB
  screenshots: 10 * 1024 * 1024,  // 10MB
  invoices: 20 * 1024 * 1024,     // 20MB
  imports: 20 * 1024 * 1024,      // 20MB
  cvs: 10 * 1024 * 1024,          // 10MB
};

export type FileContext =
  | 'avatars'
  | 'signatures'
  | 'images'
  | 'documents'
  | 'screenshots'
  | 'invoices'
  | 'imports'
  | 'cvs';

export interface FileValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates a file against allowed types and size limits for a given context.
 */
export function validateFile(file: File, context: FileContext): FileValidationResult {
  const allowedTypes = ALLOWED_TYPES[context];
  const maxSize = MAX_SIZES[context];

  if (!allowedTypes || !maxSize) {
    return { valid: false, error: 'Unknown file context' };
  }

  // Validate MIME type
  if (!allowedTypes.includes(file.type)) {
    const friendlyTypes = allowedTypes
      .map((t) => t.split('/')[1]?.toUpperCase() || t)
      .join(', ');
    return {
      valid: false,
      error: `Invalid file type. Allowed: ${friendlyTypes}`,
    };
  }

  // Validate size
  if (file.size > maxSize) {
    const maxMB = Math.round(maxSize / (1024 * 1024));
    return {
      valid: false,
      error: `File size exceeds ${maxMB}MB limit`,
    };
  }

  // Validate file name (no path traversal)
  if (file.name.includes('..') || file.name.includes('/') || file.name.includes('\\')) {
    return { valid: false, error: 'Invalid file name' };
  }

  return { valid: true };
}

/**
 * Validates multiple files. Returns the first error found, or valid.
 */
export function validateFiles(files: File[], context: FileContext): FileValidationResult {
  for (const file of files) {
    const result = validateFile(file, context);
    if (!result.valid) return result;
  }
  return { valid: true };
}
