/**
 * How the page words a command to one forge wherever it offers one: the refused command's own name in its refusal, and B2's Stop question
 * with its two choices and what keeps waiting while the forge is stopped.
 */
import type { CommandKind, ForgeCommandBody, ForgeStopAgents } from '../../@types/CommandDocument.ts';
import type { FleetDocumentForge }                             from '../../@types/FleetDocument.ts';

export interface StopChoice {
  readonly agents:      ForgeStopAgents;
  readonly title:       string;
  readonly consequence: string;
}

/** B2's Stop question; with no agent running it has no choices and stops the Overseer only. */
export interface StopQuestion {
  readonly label:       string;
  readonly question:    string;
  readonly choices:     readonly StopChoice[];
  readonly consequence: string | null;
}

const FORGE_COMMAND_LABELS: Readonly<Record<ForgeCommandBody['kind'], string>> = {
  'forge-start':           'Start',
  'forge-pause':           'Pause',
  'forge-resume':          'Resume',
  'forge-restart':         'Restart',
  'forge-update':          'Update forge',
  'forge-open-in-browser': 'Open in new tab',
  'forge-hide':            'Hide in Gaia',
  'forge-unhide':          'Show again',
  'forge-stop':            'Stop',
  'forge-concurrency-set': 'the agent limit',
};

function countedPhrase(count: number, singularPhrase: string, pluralPhrase: string): string {
  return `${count} ${count === 1 ? singularPhrase : pluralPhrase}`;
}

/** The name a refusal gives the refused command, `null` for a command that names no forge. */
function commandLabelOf(kind: CommandKind): string | null {
  return Object.hasOwn(FORGE_COMMAND_LABELS, kind) ? FORGE_COMMAND_LABELS[kind as ForgeCommandBody['kind']] : null;
}

function stopChoicesOf(agentsRunning: number): StopChoice[] {
  if (agentsRunning === 0) return [];
  const theAgents = agentsRunning === 1 ? 'The agent' : `The ${agentsRunning} agents`;
  return [
    {
      agents:      'keep',
      title:       'Stop the Overseer only',
      consequence: `${theAgents} ${agentsRunning === 1 ? 'finishes what it is on under its Watcher' : 'finish what they are on under their Watchers'}. `
        + 'Nothing new starts until this forge is started again.',
    },
    {
      agents:      'stop-first',
      title:       'Stop the agents, then the Overseer',
      consequence: `${theAgents} ${agentsRunning === 1 ? 'winds down first and its tickets return' : 'wind down first and their tickets return'} to the board. `
        + 'Then the Overseer stops.',
    },
  ];
}

/** The caller decides whether its forge can be stopped at all; this words the question. */
function stopQuestionOf(forge: FleetDocumentForge): StopQuestion {
  const agentsRunning = forge.concurrency?.agentsInFlight ?? forge.agents.length;
  const waitingCount = forge.fidelity === 'counts-only' ? forge.attentionCount : forge.attention.length;
  const running = agentsRunning === 0 ? '' : ` ${countedPhrase(agentsRunning, 'agent is', 'agents are')} running.`;
  return {
    label:       `Stop ${forge.project}`,
    question:    `Stop the Overseer of ${forge.project}?${running}`,
    choices:     stopChoicesOf(agentsRunning),
    consequence: waitingCount === null || waitingCount === 0
      ? null
      : `${countedPhrase(waitingCount, 'entry keeps', 'entries keep')} waiting on you while it is stopped.`,
  };
}

export const ForgeCommandTextUtil = {
  commandLabelOf,
  stopQuestionOf,
} as const;
