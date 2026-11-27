/** The bounds that more than one part of Gaia reads: the server that keeps to them and the page that states them. */
export const LIMITS = {
  /** Each forge reports its newest 50 log entries, and the Activity view promises exactly those. */
  activityEntriesShownPerForge: 50,
} as const;

/** At least the forge's own picture bound (3,932,160 bytes), so a picture over it is refused by the forge, in the forge's words. */
export const BOARD_PICTURE_UPLOAD_LIMIT_BYTES = 4_194_304;

/** A board command the page posts: a few hundred bytes, but for the ticket document kinds that carry a document's text. */
export const BOARD_COMMAND_BODY_BOUND_BYTES = 65_536;

/**
 * A ticket document's save, an edited proposal and a comment's quote carry up to the whole document: at most 200,000 characters, each a few
 * bytes once encoded and escaped.
 */
export const TICKET_DOCUMENT_COMMAND_BODY_BOUND_BYTES = 1_048_576;
