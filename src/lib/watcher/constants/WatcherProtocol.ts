/** The Watcher protocol this Watcher code speaks, recorded in every Watcher file so a later Overseer knows how to read and reach it. */
export const WATCHER_PROTOCOL_VERSION = 2;

/** The oldest Watcher protocol an Overseer still attaches to; a Watcher below it is watched through its files alone until it ends. */
export const WATCHER_PROTOCOL_OLDEST_SUPPORTED = 1;

/** The shape of an event log line, `{sequence, origin, line}`; raised only when a reader of the old shape would misread the new one. */
export const EVENT_LOG_FORMAT_VERSION = 1;

/** How many client frames an ended Watcher answers without the acknowledgement before it exits anyway: a count, never a time. */
export const WATCHER_LINGER_FRAMES = 5;

/** How long an ended child's piped stderr may finish before its end is recorded: it bounds a wait and decides nothing about the end. */
export const CHILD_STANDARD_ERROR_DRAIN_MILLISECONDS = 500;

/** The folder of the monitor folder that holds the Watcher sockets and every secret. */
export const WATCHER_FOLDER_NAME = 'watchers';
