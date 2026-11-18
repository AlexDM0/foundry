/** The Watcher protocol this Watcher code speaks, recorded in every Watcher file so a later Overseer knows how to read and reach it. */
export const WATCHER_PROTOCOL_VERSION = 2;

/** The oldest Watcher protocol an Overseer still attaches to; a Watcher below it is watched through its files alone until it ends. */
export const WATCHER_PROTOCOL_OLDEST_SUPPORTED = 1;

/** How many client frames an ended Watcher answers without the acknowledgement before it exits anyway: a count, never a time. */
export const WATCHER_LINGER_FRAMES = 5;
