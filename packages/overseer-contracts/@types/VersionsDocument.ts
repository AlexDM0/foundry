/**
 * `GET /api/versions`, which a forge's Overseer and Gaia's own server each serve at that unversioned path and never remove: the server's
 * system version and the oldest version of the same system a client may have been built for and still be served. Both are in the
 * server's own version space. A client reads it first and decides by it which paths it calls, or whether it can talk to the server at all.
 */

/**
 * A system's version by interoperability, never its package version: a minor change only adds, so every client of that major keeps
 * working; a major change may break a client built for an older major.
 */
export interface SystemVersion {
  readonly major: number;
  readonly minor: number;
}

export interface VersionsDocument {
  readonly current:          SystemVersion;
  /** Raising it is what lets the server remove an old endpoint version: no client it still supports calls it. */
  readonly minimumSupported: SystemVersion;
}
