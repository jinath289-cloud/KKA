import { supabase } from '@/lib/supabase';
import { ImageValidationError, validateImage, type ImageErrorKey } from '@/lib/images';

export type ProductImageErrorKey =
  | ImageErrorKey
  | 'catalog_image_error_permission'
  | 'catalog_image_error_network';

export class ProductImageError extends Error {
  constructor(readonly key: ProductImageErrorKey) {
    super(key);
    this.name = 'ProductImageError';
  }
}

function friendlyError(error: unknown): ProductImageError {
  if (typeof error === 'object' && error !== null && 'code' in error && error.code === '42501') {
    return new ProductImageError('catalog_image_error_permission');
  }
  if (typeof error === 'object' && error !== null && 'status' in error && error.status === 403) {
    return new ProductImageError('catalog_image_error_permission');
  }
  if (typeof error === 'object' && error !== null && 'statusCode' in error && error.statusCode === '403') {
    return new ProductImageError('catalog_image_error_permission');
  }
  return new ProductImageError('catalog_image_error_network');
}

function imageExtension(file: File): 'webp' | 'jpg' | 'png' {
  if (file.type === 'image/webp') return 'webp';
  if (file.type === 'image/jpeg') return 'jpg';
  if (file.type === 'image/png') return 'png';
  throw new ProductImageError('catalog_image_error_type');
}

export async function uploadProductImage(productId: string, file: File): Promise<string> {
  try {
    validateImage(file);
  } catch (error) {
    if (error instanceof ImageValidationError) throw new ProductImageError(error.key);
    throw error;
  }
  if (file.size >= 2 * 1024 * 1024) throw new ProductImageError('catalog_image_error_size');
  const path = `products/${productId}/${crypto.randomUUID()}.${imageExtension(file)}`;
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new ProductImageError('catalog_image_error_permission');

  const { data: product, error: productError } = await supabase
    .from('products')
    .select('image_path')
    .eq('id', productId)
    .single();
  if (productError) throw friendlyError(productError);

  const { error: uploadError } = await supabase.storage
    .from('product-images')
    .upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) throw friendlyError(uploadError);

  const { error: updateError } = await supabase
    .from('products')
    .update({ image_path: path })
    .eq('id', productId);
  if (updateError) {
    await supabase.storage.from('product-images').remove([path]);
    throw friendlyError(updateError);
  }

  if (product.image_path) {
    try {
      await supabase.storage.from('product-images').remove([product.image_path]);
    } catch {
      // Replaced images remain usable if old-file cleanup is temporarily unavailable.
    }
  }
  return path;
}

export async function removeProductImage(productId: string, path: string): Promise<void> {
  const { error: updateError } = await supabase
    .from('products')
    .update({ image_path: null })
    .eq('id', productId);
  if (updateError) throw friendlyError(updateError);

  const { error: removeError } = await supabase.storage.from('product-images').remove([path]);
  if (removeError) throw friendlyError(removeError);
}

export function getProductImageUrl(path: string): string {
  return supabase.storage.from('product-images').getPublicUrl(path).data.publicUrl;
}
