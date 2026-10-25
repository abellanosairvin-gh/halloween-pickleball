/** Longest side of a stored costume photo, in pixels: plenty for a phone screen, and quick to load at the party. */
const MAX_SIDE = 1080;
const QUALITY = 0.8;

const UNREADABLE = 'That file isn’t a photo this browser can open. Try another one.';

/** Opens a photo upright: phones save portrait shots sideways with a note to rotate them. */
async function decode(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } catch {
      throw new Error(UNREADABLE);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

/** Shrinks a photo from the camera or library to a JPEG, returned as base64 without the data: prefix. */
export async function shrinkPhoto(file: Blob): Promise<string> {
  const image = await decode(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(image.width, image.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error(UNREADABLE);
  // A transparent PNG would turn black as a JPEG.
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  if ('close' in image) image.close();
  const url = canvas.toDataURL('image/jpeg', QUALITY);
  if (!url.startsWith('data:image/jpeg;base64,')) throw new Error(UNREADABLE);
  return url.slice('data:image/jpeg;base64,'.length);
}
