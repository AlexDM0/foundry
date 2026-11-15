/** A picture is known by the sha256 of its bytes, as 64 lower-case hex digits: the log, a stored job, the picture store and a request agree on it. */
export const PICTURE_ID_PATTERN = /^[0-9a-f]{64}$/;
