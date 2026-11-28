import type { BoardRelayRefusal } from '../../../shared/@types/board/BoardRelayVerdict.ts';

/** Every refusal of the page server's own, worded in `RefusalAnswer.ts`. */
export type PageServerRefusal =
  | 'foreign-host'
  | 'foreign-origin'
  | 'opaque-origin'
  | 'preflight'
  | 'not-holder-of-token'
  | 'no-session'
  | 'code-refused'
  | 'body-not-understood'
  | 'body-too-large'
  | 'not-found'
  | 'method-not-allowed'
  | 'page-unbuildable'
  | 'answer-failed';

/**
 * Every answer the page server gives, by its refusal or by how the request ended. `refused-by-forge`: a forge refused the relayed request.
 * `install-held`: the forge holds launches for an install change. `command-not-supported`: a command Gaia cannot carry to that forge.
 */
export type PageServerAnswer =
  | PageServerRefusal
  | BoardRelayRefusal
  | 'answered'
  | 'answered-without-content'
  | 'refused-by-forge'
  | 'install-held'
  | 'command-not-supported';
