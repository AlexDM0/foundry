/**
 * The Agents view as the agent panel habitat of Flint (`flint/`): there Flint is one of the crew. It waves to an agent that appears,
 * copies the state of an agent that works, standing below the job column, shows the one action of the job it copies one time, answers the
 * changes of a job and of the launch slots, and reads the playbook when every agent is idle.
 */
import {
  ARRIVED_CUE,
  type SpriteCopyTarget,
  type SpriteCue,
  type SpriteHabitat,
  type SpriteSuggestion
} from '../../../lib/flint/FlintInterface.ts';

export const AGENT_PANEL_CUES = Object.freeze({
  AGENT_APPEARS:           'agent-appears',
  AGENT_WORKS:             'agent-works',
  ALL_AGENTS_IDLE:         'all-agents-idle',
  COPIED_JOB_LAUNCHES:     'copied-job-launches',
  COPIED_JOB_WINDS_DOWN:   'copied-job-winds-down',
  GATE_FAILED:             'gate-failed',
  JOB_RESUMED_AFTER_CRASH: 'job-resumed-after-crash',
  JOB_STOP_REQUESTED:      'job-stop-requested',
  JOB_FRESH_REQUESTED:     'job-fresh-requested',
  JOB_LANDED:              'job-landed',
  SLOT_FILLED:             'slot-filled',
  NO_SLOT_FREE:            'no-slot-free',
} satisfies Readonly<Record<string, SpriteCue>>);

/** The habitat reads what to copy through `copyTargetFor`, on each frame Flint copies; make it once per view. */
export function agentPanelSpriteHabitatOf(copyTargetFor: () => SpriteCopyTarget | null): SpriteHabitat {
  return Object.freeze({
    kind:        'agent-panel',
    description: 'The agents of the board: each builder, reviewer, merge and session, its state and its calls.',
    suggestions: Object.freeze<SpriteSuggestion[]>([
      { when: ARRIVED_CUE, respond: 'wave', note: 'Wave to the agents.' },
      { when: AGENT_PANEL_CUES.AGENT_APPEARS, respond: 'wave', note: 'Wave to the agent that appeared.' },
      { when: AGENT_PANEL_CUES.AGENT_WORKS, respond: 'copy', note: 'Stand below the job column and copy the state of the agent.' },
      { when: AGENT_PANEL_CUES.ALL_AGENTS_IDLE, respond: 'playbook', note: 'Every agent is idle while the Overseer serves.' },
      { when: AGENT_PANEL_CUES.COPIED_JOB_LAUNCHES, respond: 'strike-spark', note: 'The agent Flint copies is launched.' },
      { when: AGENT_PANEL_CUES.COPIED_JOB_WINDS_DOWN, respond: 'wind-down', note: 'The agent Flint copies winds down.' },
      { when: AGENT_PANEL_CUES.GATE_FAILED, respond: 'gate-failed', note: 'A handoff went red at its gate or Customs check.' },
      { when: AGENT_PANEL_CUES.JOB_RESUMED_AFTER_CRASH, respond: 'crash-resume', note: 'An agent is resumed after a crash.' },
      { when: AGENT_PANEL_CUES.JOB_STOP_REQUESTED, respond: 'forced-stop', note: 'User stopped an agent.' },
      { when: AGENT_PANEL_CUES.JOB_FRESH_REQUESTED, respond: 'molt', note: 'User asked for a fresh agent on the same worktree.' },
      { when: AGENT_PANEL_CUES.JOB_LANDED, respond: 'ship', note: 'A merge landed or integrated its work.' },
      { when: AGENT_PANEL_CUES.SLOT_FILLED, respond: 'slots', note: 'An agent took a launch slot, and a slot is still free.' },
      { when: AGENT_PANEL_CUES.NO_SLOT_FREE, respond: 'slots-full', note: 'Every launch slot is taken while a ready ticket waits.' },
    ]),
    copyTargetFor,
  });
}
