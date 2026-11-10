/** Each picture type the store takes, its file extension and the first bytes that tell it; a `null` byte matches any byte. */
export const PICTURE_SIGNATURES: readonly { mediaType: string; extension: string; firstBytes: readonly (number | null)[] }[] = [
  { mediaType: 'image/png', extension: 'png', firstBytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mediaType: 'image/jpeg', extension: 'jpg', firstBytes: [0xff, 0xd8, 0xff] },
  // `GIF87a` or `GIF89a`.
  { mediaType: 'image/gif', extension: 'gif', firstBytes: [0x47, 0x49, 0x46, 0x38, null, 0x61] },
  // `RIFF`, four bytes of length, then `WEBP`.
  { mediaType: 'image/webp', extension: 'webp', firstBytes: [0x52, 0x49, 0x46, 0x46, null, null, null, null, 0x57, 0x45, 0x42, 0x50] },
];
