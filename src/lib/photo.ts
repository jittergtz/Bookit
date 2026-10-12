/** Decode locally using the browser's photo support, including mobile photo libraries. */
export async function preparePhoto(file: File): Promise<string> {
  if (file.size > 40_000_000) throw new Error("Choose a photo under 40 MB.");
  if (file.type && !file.type.startsWith("image/"))
    throw new Error("Choose an image from your photo library.");
  const url = URL.createObjectURL(file);
  const photo = new Image();
  try {
    await new Promise<void>((resolve, reject) => {
      photo.onload = () => resolve();
      photo.onerror = () =>
        reject(new Error("This photo format could not be opened. Try a JPG or PNG copy."));
      photo.src = url;
    });
    if (!photo.naturalWidth || !photo.naturalHeight) throw new Error("This photo is empty.");
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This device could not prepare the photo. Please try again.");
    // Safari may fall back to PNG when WebP encoding is unavailable. Reduce dimensions
    // until either output fits the image-layer limit, including detailed transparent PNGs.
    for (const edge of [768, 512, 384, 256, 192, 128]) {
      const scale = Math.min(1, edge / Math.max(photo.naturalWidth, photo.naturalHeight));
      canvas.width = Math.max(1, Math.round(photo.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(photo.naturalHeight * scale));
      context.drawImage(photo, 0, 0, canvas.width, canvas.height);
      const image = canvas.toDataURL("image/webp", 0.8);
      if (image.length <= 300_000 && /^data:image\/(png|jpeg|webp);base64,/.test(image))
        return image;
    }
    throw new Error("This photo could not be resized. Try another image.");
  } finally {
    photo.onload = null;
    photo.onerror = null;
    URL.revokeObjectURL(url);
  }
}
