import heic2any from "heic2any";

const HEIC_TYPES = ["image/heic", "image/heif", ""];

function isHeicFile(file: File): boolean {
  if (HEIC_TYPES.includes(file.type)) {
    return /\.heic$/i.test(file.name);
  }
  return file.type === "image/heic" || file.type === "image/heif";
}

/**
 * Converts a HEIC/HEIF file to JPEG. Returns the original file if not HEIC.
 */
export async function convertHeicIfNeeded(file: File): Promise<File> {
  if (!isHeicFile(file)) return file;

  const blob = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.92 });
  const resultBlob = Array.isArray(blob) ? blob[0] : blob;
  const newName = file.name.replace(/\.heic$/i, ".jpg");
  return new File([resultBlob], newName, { type: "image/jpeg" });
}

/**
 * Converts an array of files, converting any HEIC files to JPEG.
 */
export async function convertHeicFiles(files: File[]): Promise<File[]> {
  return Promise.all(files.map(convertHeicIfNeeded));
}
