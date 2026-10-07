"use client";
import imageCompression from "browser-image-compression";

const MAX_EDGE = 2400;

/**
 * Client-side preparation before upload: applies EXIF orientation, scales the long edge
 * to ≤2400px (plenty for handwriting), re-encodes as JPEG, then applies any manual rotation.
 */
export async function prepareForUpload(file: File, extraRotation = 0): Promise<{ blob: Blob; width: number; height: number }> {
  const compressed = await imageCompression(file, {
    maxWidthOrHeight: MAX_EDGE,
    maxSizeMB: 2,
    initialQuality: 0.85,
    fileType: "image/jpeg",
    useWebWorker: true,
  });
  const bitmap = await createImageBitmap(compressed, { imageOrientation: "from-image" });
  const rot = ((extraRotation % 360) + 360) % 360;
  const swap = rot === 90 || rot === 270;
  const width = swap ? bitmap.height : bitmap.width;
  const height = swap ? bitmap.width : bitmap.height;
  if (rot === 0) {
    bitmap.close();
    return { blob: compressed, width, height };
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.translate(width / 2, height / 2);
  ctx.rotate((rot * Math.PI) / 180);
  ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode failed"))), "image/jpeg", 0.88),
  );
  return { blob, width, height };
}
