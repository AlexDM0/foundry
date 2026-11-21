/**
 * How the page words a forge's own state wherever it shows one: the condition it shows, its word, in a row or leading a line in sentence
 * case, the dot that stands beside the word, the usage line as the Bridge words it, the callout of an Overseer that stopped answering (B3),
 * and its agents a network outage stopped.
 */
import type {
  FleetDocumentCondition,
  FleetDocumentForge,
  FleetDocumentPresenceState,
  FleetDocumentUsage,
} from '../../@types/FleetDocument.ts';
import type { DotCondition } from '../../design-system/ConditionDot.tsx';

import { CountTextUtil } from './CountTextUtil.ts';

export interface UnreachableCalloutText {
  readonly word:        string;
  readonly sentence:    string;
  readonly machineLine: string | null;
}

/**
 * The condition a forge shows: the one its document carries, `outdated` for a forge older than the forge version this Gaia is built for, or
 * how a forge that crashed, is down or hung is present, which says more than `unreachable` does.
 */
export type ShownCondition = FleetDocumentCondition | 'outdated' | 'crashed' | 'down' | 'hung';

const CONDITION_WORDS: Readonly<Record<ShownCondition, string>> = {
  'live':          'live',
  'paused':        'paused',
  'held':          'launches held',
  'passing-baton': 'passing the baton',
  'starting':      'starting',
  'dormant':       'dormant',
  'unreachable':   'unreachable',
  'unreadable':    'not readable',
  'missing':       'repository missing',
  'outdated':      'needs update',
  'crashed':       'crashed',
  'down':          'down',
  'hung':          'stopped supervising',
};

const SHOWN_PRESENCE_STATES: Readonly<Partial<Record<FleetDocumentPresenceState, ShownCondition>>> = {
  crashed: 'crashed',
  down:    'down',
  hung:    'hung',
};

const MACHINE_LINE_SEPARATOR = ' · ';

/**
 * The server reads an older forge as `unreadable`, as it does a newer one; the page tells it apart, since it waits on User's Update forge. A
 * forge that crashed, is down or hung shows that, since it waits on User's start or resume.
 */
function shownConditionOf(forge: Pick<FleetDocumentForge, 'condition' | 'versions' | 'presence'>): ShownCondition {
  if (forge.versions?.verdict === 'older') return 'outdated';
  return SHOWN_PRESENCE_STATES[forge.presence.state] ?? forge.condition;
}

function conditionWordOf(condition: ShownCondition): string {
  return CONDITION_WORDS[condition];
}

/** The word as it leads a line or heads a cell: `Launches held`. */
function conditionWordInSentenceCaseOf(condition: ShownCondition): string {
  const word = CONDITION_WORDS[condition];
  return `${word.charAt(0).toUpperCase()}${word.slice(1)}`;
}

/**
 * A forge passing the baton draws the ring of one on its way, as a starting forge does; one that crashed, is down or hung draws the failure
 * of one that does not answer. The word tells each apart.
 */
function dotConditionOf(condition: ShownCondition): DotCondition {
  switch (condition) {
    case 'passing-baton':
      return 'starting';
    case 'crashed':
    case 'down':
    case 'hung':
      return 'unreachable';
    default:
      return condition;
  }
}

/**
 * Under the limit, with when the current window resets when the forge reports it; or the window that hit the limit and when it resets.
 * Each time is printed by the caller's own clock.
 */
function usageTextOf(usage: FleetDocumentUsage, clockTextOfStamp: (stamp: string) => string): string {
  if (usage.resetsAt === null) {
    return usage.currentWindowResetsAt === null ? 'under its limit' : `under its limit · window resets ${clockTextOfStamp(usage.currentWindowResetsAt)}`;
  }
  const windowWord = usage.window === null ? '' : `${usage.window} `;
  return `${windowWord}limit hit · resets ${clockTextOfStamp(usage.resetsAt)}`;
}

/** The machine line names the address, the process and the last answer, each only when the document holds it. */
function unreachableCalloutTextOf(forge: FleetDocumentForge, lastAnswerClock: string | null): UnreachableCalloutText {
  const address = forge.url === null ? null : forge.url.replace(/^https?:\/\//, '');
  const machineParts = [address, forge.processId === null ? null : `process ${forge.processId}`, lastAnswerClock === null ? null : `last answer ${lastAnswerClock}`];
  return {
    word:        'Unreachable',
    sentence:    'Its Overseer stopped answering. The registry still names it.',
    machineLine: machineParts.filter((part) => part !== null).join(MACHINE_LINE_SEPARATOR) || null,
  };
}

/** `2 agents stopped on a network outage`: a count the server serves, of jobs that wait for the outage resume. */
function outageEndingsTextOf(outageEndings: number): string {
  return `${CountTextUtil.countedPhrase(outageEndings, 'agent', 'agents')} stopped on a network outage`;
}

export const ForgeTextUtil = {
  outageEndingsTextOf,
  shownConditionOf,
  conditionWordOf,
  conditionWordInSentenceCaseOf,
  dotConditionOf,
  usageTextOf,
  unreachableCalloutTextOf,
} as const;
