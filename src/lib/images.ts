/**
 * The one rule for every photograph the league uploads.
 *
 * Player faces and match pitches land in different buckets, but both buckets
 * are created with the same ceiling and the same three types, so checking them
 * in one place keeps the message the uploader sees honest about what the
 * database would have accepted.
 */

const MAX_IMAGE_BYTES = 3 * 1024 * 1024

const IMAGE_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

/** Validates a chosen photograph and returns the extension its path will use. */
export function toImageExtension(file: File): string {
  const extension = IMAGE_EXTENSIONS[file.type]

  if (!extension) throw new Error('La imagen debe ser JPEG, PNG o WebP')

  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error('La imagen no puede superar los 3 MB')
  }

  return extension
}
