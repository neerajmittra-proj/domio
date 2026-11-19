// Property photos live in R2 under this prefix and are served publicly by
// app/api/property-image/[name]/route.ts (same visibility as the old
// /public/uploads/properties files).
export const PROPERTY_IMAGE_PREFIX = 'property-images/';

// prop_<timestamp>_<8 hex>.<ext> — the only names the upload route generates.
export const PROPERTY_IMAGE_NAME = /^prop_\d{10,16}_[0-9a-f]{8}\.(jpg|png|webp|avif|gif)$/;

export const PROPERTY_IMAGE_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
  gif: 'image/gif',
};
