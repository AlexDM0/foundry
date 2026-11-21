/** The bounds that more than one part of Gaia reads: the server that keeps to them and the page that states them. */
export const LIMITS = {
  /** Each forge reports its newest 50 log entries, and the Activity view promises exactly those (artboard A3). */
  activityEntriesShownPerForge: 50,
} as const;

/** At least the forge's own picture bound (3,932,160 bytes), so a picture over it is refused by the forge, in the forge's words. */
export const BOARD_PICTURE_UPLOAD_LIMIT_BYTES = 4_194_304;
