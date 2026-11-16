/**
 * The record a page that frames a forge's Bridge writes while it serves, one file per host in the monitor folder's `frame-ancestors` folder:
 * every forge of the account lets each record's `origin` frame its Bridge. A host names its own file and may add keys of its own, which
 * a forge passes over; a record of another major, an unreadable one or an opaque origin adds nothing.
 */
export const FRAME_ANCESTOR_RECORD_FORMAT = {
  folderName: 'frame-ancestors',
  extension:  '.json',
  major:      1,
  minor:      0,
} as const;

export interface FrameAncestorRecord {
  readonly version: typeof FRAME_ANCESTOR_RECORD_FORMAT.major;
  /** Only adds keys, so a forge reads every minor of its major. */
  readonly minor:   number;
  /** The origin of the page that frames the Bridge, such as `http://127.0.0.1:4790`. */
  readonly origin:  string;
}
