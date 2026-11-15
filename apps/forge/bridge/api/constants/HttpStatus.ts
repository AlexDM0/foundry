/** The HTTP statuses the Overseer's API answers that the Bridge's clients tell apart. */
export const HTTP_STATUS = Object.freeze({
  OK:                  200,
  UNAUTHORIZED:        401,
  LOCKED:              423,
  SERVICE_UNAVAILABLE: 503,
});
