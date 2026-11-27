/** Raised by hand whenever a frame, the launch, or a reply changes; never with the code version. */
export const TALOS_PROTOCOL_VERSION = 2;
export const CHILD_RECORD_FORMAT_VERSION = 1;
export const TALOS_RECORD_FORMAT_VERSION = 1;
export const TALOS_START_FILE_FORMAT_VERSION = 1;
/** Origin `talos` replaced the retired origin of format 1. */
export const EVENT_LOG_FORMAT_VERSION = 2;
/**
 * How long a client's unterminated line may grow before it is refused, checked before any secret: it bounds memory only, above the largest
 * frame a Hephaestus sends, a chat line with every picture a message may carry.
 */
export const TALOS_CLIENT_LINE_LIMIT_CHARACTERS = 33_554_432;
/** How long an ended child's piped stderr may finish before its end is recorded: it bounds a wait and decides nothing about the end. */
export const CHILD_STANDARD_ERROR_DRAIN_MILLISECONDS = 500;
/** Below this renewal interval the wake rule waits two intervals. */
export const WAKE_GRACE_DOUBLING_BELOW_MILLISECONDS = 5000;
export const TALOS_FOLDER_NAME = 'talos';
/** The folder of the monitor folder that holds every socket, the API token and every secret; the worker profiles deny it as a whole. */
export const PRIVATE_FOLDER_NAME = 'private';
