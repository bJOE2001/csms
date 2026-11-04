export const MAX_PRODUCT_IMAGE_BYTES = 5 * 1024 * 1024;
export const PRODUCT_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const PRODUCT_IMAGE_ACCEPT = PRODUCT_IMAGE_TYPES.join(",");

export function productImageFileError(file: Pick<File, "size" | "type">) {
  if (!PRODUCT_IMAGE_TYPES.includes(file.type))
    return "Choose a JPG, PNG, or WebP image. SVG and other files are not supported.";
  if (!file.size) return "This image is empty. Choose another file.";
  if (file.size > MAX_PRODUCT_IMAGE_BYTES) return "Choose an image smaller than or equal to 5 MB.";
  return "";
}
