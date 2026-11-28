/** Every refusal of the page server's own, worded in exactly this one place; its status is `HTTP_STATUS_OF_ANSWER`'s. */
import type { PageServerRefusal } from './@types/PageServerAnswer.ts';
import { HTTP_STATUS_OF_ANSWER }  from './HttpStatusOfAnswer.ts';

const REFUSAL_SENTENCES: Readonly<Record<PageServerRefusal, string>> = {
  'foreign-host':        'Gaia answers only requests addressed to its own loopback address and port.',
  'foreign-origin':      'Gaia answers no page of another origin.',
  'opaque-origin':       'Gaia answers no page without an origin of its own.',
  'preflight':           'Gaia grants no cross-origin request.',
  'not-holder-of-token': 'This route needs Gaia\'s token.',
  'no-session':          'This route needs a session of Gaia\'s page.',
  'code-refused':        'The session code is spent, past its life or never issued.',
  'body-not-understood': 'Gaia did not understand the request\'s body.',
  'body-too-large':      'The request\'s body is larger than Gaia takes at this address.',
  'not-found':           'Gaia has nothing at this address.',
  'method-not-allowed':  'Gaia answers this address with another method.',
  'page-unbuildable':    'Gaia could not build its page.',
  'answer-failed':       'Gaia failed to answer this request.',
};

const PLAIN_TEXT_CONTENT_TYPE = 'text/plain; charset=utf-8';

export function refusalAnswerOf(refusal: PageServerRefusal): Response {
  return new Response(`${REFUSAL_SENTENCES[refusal]}\n`, { status: HTTP_STATUS_OF_ANSWER[refusal], headers: { 'content-type': PLAIN_TEXT_CONTENT_TYPE } });
}
