export type ImageErrorKey = 'catalog_image_error_type' | 'catalog_image_error_size';

export class ImageValidationError extends Error {
  constructor(readonly key: ImageErrorKey) {
    super(key);
    this.name = 'ImageValidationError';
  }
}

const MAX_INPUT_SIZE = 5 * 1024 * 1024;
const MAX_OUTPUT_SIZE = 2 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function validateImage(file: File): void {
  if (!ALLOWED_TYPES.has(file.type)) {
    throw new ImageValidationError('catalog_image_error_type');
  }
  if (file.size > MAX_INPUT_SIZE) {
    throw new ImageValidationError('catalog_image_error_size');
  }
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new ImageValidationError('catalog_image_error_type'));
    }, type, quality);
  });
}

export async function compressImage(file: File): Promise<File> {
  validateImage(file);
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new ImageValidationError('catalog_image_error_type');
  }

  try {
    const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
    let width = Math.max(1, Math.round(bitmap.width * scale));
    let height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new ImageValidationError('catalog_image_error_type');

    const supportsWebp = canvas.toDataURL('image/webp').startsWith('data:image/webp');
    const outputType = supportsWebp ? 'image/webp' : 'image/jpeg';
    let blob: Blob;

    do {
      canvas.width = width;
      canvas.height = height;
      context.clearRect(0, 0, width, height);
      context.drawImage(bitmap, 0, 0, width, height);
      blob = await canvasBlob(canvas, outputType, 0.8);
      if (blob.size < MAX_OUTPUT_SIZE) break;
      width = Math.max(1, Math.floor(width * 0.85));
      height = Math.max(1, Math.floor(height * 0.85));
    } while (width > 1 || height > 1);

    if (blob.size >= MAX_OUTPUT_SIZE) {
      throw new ImageValidationError('catalog_image_error_size');
    }

    const extension = outputType === 'image/webp' ? 'webp' : 'jpg';
    return new File([blob], `product-image.${extension}`, { type: outputType, lastModified: Date.now() });
  } finally {
    bitmap.close();
  }
}
