/**
 * Posts Flint's perception digest to the Overseer's `/api/flint-brain/ask`, the Bridge's own route, through the session token source the
 * command client shares: the brain's move, or why the rule director moves this time. Every other answer, a lost session and an Overseer
 * that cannot be reached leave the move to the rule director as well.
 */
import { refusalOf }               from './RefusalOf.ts';
import type { SessionTokenSource } from './SessionTokenSource.ts';
import { HTTP_STATUS }             from './constants/HttpStatus.ts';

export interface FlintBrainSuggestionDocument {
  readonly when:    string;
  readonly respond: string;
  readonly note?:   string;
}

export interface FlintBrainContentDocument {
  readonly facts:    Readonly<Record<string, string | number>>;
  readonly excerpt?: string;
}

/** Flint's perception digest as the route reads it, with the moves this Bridge's Flint knows, to which the brain's answer is held. */
export interface FlintBrainDigestDocument {
  readonly habitatKind:       string | null;
  readonly description:       string | null;
  readonly suggestions:       readonly FlintBrainSuggestionDocument[];
  readonly recentCues:        readonly string[];
  readonly newCues:           readonly string[];
  readonly content:           FlintBrainContentDocument | null;
  readonly lastIntent:        string | null;
  readonly isAsleep:          boolean;
  readonly visitTargetKind:   string | null;
  readonly copyIsOffered:     boolean;
  readonly quietMilliseconds: number;
  readonly intents:           readonly string[];
  readonly emotes:            readonly string[];
}

export type FlintBrainAsk =
  | { readonly verdict: 'answered'; readonly intent: string; readonly emote: string | null }
  /** The Overseer's reason the rule director moves, such as `too-soon` or `unchanged`. */
  | { readonly verdict: 'not-asked'; readonly reason: string }
  | { readonly verdict: 'refused'; readonly refusal: string }
  /** `/api/session-token` answered 401: the page's session cookie is unknown to the Overseer. */
  | { readonly verdict: 'no-session' }
  | { readonly verdict: 'unreachable' };

export interface FlintBrainClient {
  readonly ask: (digest: FlintBrainDigestDocument) => Promise<FlintBrainAsk>;
}

const FLINT_BRAIN_ASK_PATH = '/api/flint-brain/ask';

function askOf(body: unknown): FlintBrainAsk {
  if (typeof body !== 'object' || body === null) return { verdict: 'unreachable' };
  const {
    kind, intent, emote, reason
  } = body as Record<string, unknown>;
  if (kind === 'answered' && typeof intent === 'string' && (emote === null || typeof emote === 'string')) return { verdict: 'answered', intent, emote };
  if (kind === 'not-asked' && typeof reason === 'string') return { verdict: 'not-asked', reason };
  return { verdict: 'unreachable' };
}

/** Give it the command client's token source, so both carry one token. */
function create(tokenSource: SessionTokenSource): FlintBrainClient {
  const ask = async (digest: FlintBrainDigestDocument): Promise<FlintBrainAsk> => {
    const posted = await tokenSource.post(FLINT_BRAIN_ASK_PATH, { 'content-type': 'application/json' }, JSON.stringify(digest));
    if (posted.verdict !== 'answered') return { verdict: posted.verdict };
    const { response } = posted;
    if (response.status !== HTTP_STATUS.OK) return { verdict: 'refused', refusal: await refusalOf(response) };
    try {
      return askOf(await response.json());
    } catch {
      return { verdict: 'unreachable' };
    }
  };

  return { ask };
}

export const FlintBrainClient = Object.freeze({ create });
