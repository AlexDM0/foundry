/**
 * How the page words a forge's own state wherever it shows one: the word of its condition, the dot that stands beside the word, the usage
 * line as the Bridge words it, and the callout of an Overseer that stopped answering (artboard B3).
 */
import type { FleetDocumentCondition, FleetDocumentForge, FleetDocumentUsage } from '../../@types/FleetDocument.ts';
import type { DotCondition }                                                   from '../../design-system/ConditionDot.tsx';

export interface UnreachableCalloutText {
  readonly word:        string;
  readonly sentence:    string;
  readonly machineLine: string | null;
}

const CONDITION_WORDS: Readonly<Record<FleetDocumentCondition, string>> = {
  'live':          'live',
  'paused':        'paused',
  'held':          'launches held',
  'passing-baton': 'passing the baton',
  'starting':      'starting',
  'dormant':       'dormant',
  'unreachable':   'unreachable',
  'unreadable':    'not readable',
  'missing':       'repository missing',
};

const MACHINE_LINE_SEPARATOR = ' · ';

function conditionWordOf(condition: FleetDocumentCondition): string {
  return CONDITION_WORDS[condition];
}

/** A forge passing the baton draws the ring of one on its way, as a starting forge does; the word tells the two apart. */
function dotConditionOf(condition: FleetDocumentCondition): DotCondition {
  return condition === 'passing-baton' ? 'starting' : condition;
}

/** Under the limit, or the window that hit it and when it resets, printed by the caller's own clock. */
function usageTextOf(usage: FleetDocumentUsage, clockTextOfStamp: (stamp: string) => string): string {
  if (usage.resetsAt === null) return 'under its limit';
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

export const ForgeTextUtil = {
  conditionWordOf,
  dotConditionOf,
  usageTextOf,
  unreachableCalloutTextOf,
} as const;
