/** The bounds that more than one part of Gaia reads: the server that keeps to them and the page that states them. */
export const LIMITS = {
  /** Each forge reports its newest 50 log entries, and the Activity view promises exactly those (artboard A3). */
  activityEntriesShownPerForge: 50,
} as const;
