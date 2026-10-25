/** A costume photo ready to upload: base64 JPEGs without the data: prefix. */
export interface ShrunkPhoto {
  /** For the full-screen viewer: plenty for a phone screen, and quick to load at the party. */
  image: string;
  /** For vote cards, the gallery and the organizer's list, so guests don't load every full-size photo. */
  thumb: string;
}

const FULL = { maxSide: 1080, quality: 0.8 };
const THUMB = { maxSide: 480, quality: 0.72 };

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

function toJpeg(image: ImageBitmap | HTMLImageElement, { maxSide, quality }: typeof FULL): string {
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error(UNREADABLE);
  // A transparent PNG would turn black as a JPEG.
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const url = canvas.toDataURL('image/jpeg', quality);
  if (!url.startsWith('data:image/jpeg;base64,')) throw new Error(UNREADABLE);
  return url.slice('data:image/jpeg;base64,'.length);
}

/** Shrinks a photo from the camera or library to a full-size JPEG and a small one. */
export async function shrinkPhoto(file: Blob): Promise<ShrunkPhoto> {
  const image = await decode(file);
  try {
    return { image: toJpeg(image, FULL), thumb: toJpeg(image, THUMB) };
  } finally {
    if ('close' in image) image.close();
  }
}
