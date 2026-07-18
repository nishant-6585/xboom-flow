// Merge the front and back photos of an ID card into ONE stacked image so
// the rest of the KYC pipeline (storage, staff review, AI review) keeps
// working with a single file per document.

const MAX_WIDTH = 1600;
const GAP_PX = 24;
const JPEG_QUALITY = 0.9;

async function loadBitmap(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file);
  } catch {
    throw new Error(`Could not read "${file.name}" — please upload a JPG or PNG photo.`);
  }
}

/**
 * Stack two card photos vertically (front on top, back below) on a white
 * background and return a single JPEG file. Throws with a user-facing
 * message when an input can't be decoded.
 */
export async function mergeIdCardImages(
  front: File,
  back: File,
  outputName = "aadhaar-front-back.jpg",
): Promise<File> {
  const [a, b] = await Promise.all([loadBitmap(front), loadBitmap(back)]);
  try {
    const width = Math.min(MAX_WIDTH, Math.max(a.width, b.width));
    const heightA = Math.round((a.height / a.width) * width);
    const heightB = Math.round((b.height / b.width) * width);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = heightA + GAP_PX + heightB;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Your browser could not merge the two photos.");

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(a, 0, 0, width, heightA);
    ctx.drawImage(b, 0, heightA + GAP_PX, width, heightB);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
    );
    if (!blob) throw new Error("Your browser could not merge the two photos.");
    return new File([blob], outputName, { type: "image/jpeg" });
  } finally {
    a.close();
    b.close();
  }
}
