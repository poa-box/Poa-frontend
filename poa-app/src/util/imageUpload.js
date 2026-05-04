/**
 * Shared constants and validator for image uploads.
 * Used by avatar and org-logo upload sites to enforce consistent limits.
 */

export const MAX_AVATAR_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_LOGO_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB

// Shape used by react-dropzone's `accept` prop
export const ACCEPTED_IMAGE_MIME = {
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/gif': ['.gif'],
  'image/webp': ['.webp'],
};

// Comma string used by <input accept="...">
export const ACCEPTED_IMAGE_INPUT = 'image/png,image/jpeg,image/jpg,image/gif,image/webp';

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Validate an image file for upload.
 * @param {File} file - The selected file
 * @param {number} maxBytes - Maximum allowed size in bytes
 * @returns {{valid: true} | {valid: false, error: string}}
 */
export function validateImageFile(file, maxBytes) {
  if (!file) return { valid: false, error: 'No file selected' };
  if (!file.type || !file.type.startsWith('image/')) {
    return { valid: false, error: 'Please select an image file' };
  }
  if (file.size > maxBytes) {
    return {
      valid: false,
      error: `Image is ${formatBytes(file.size)} — must be under ${formatBytes(maxBytes)}`,
    };
  }
  return { valid: true };
}
