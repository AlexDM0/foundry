/**
 * The Agents view as the agent panel habitat of Flint (`flint/`): there Flint is one of the crew. It waves to an agent that appears,
 * copies the state of an agent that works, standing below the job column, and sleeps when every agent is idle.
 */
import type {
  SpriteCopyTarget,
  SpriteCue,
  SpriteHabitat,
  SpriteSuggestion
} from '../../../flint/SpriteHabitat.ts';
import { ARRIVED_CUE } from '../../../flint/SpriteHabitat.ts';

export const AGENT_PANEL_CUES = Object.freeze({
  AGENT_APPEARS:   'agent-appears',
  AGENT_WORKS:     'agent-works',
  ALL_AGENTS_IDLE: 'all-agents-idle',
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
      { when: AGENT_PANEL_CUES.ALL_AGENTS_IDLE, respond: 'sleep' },
    ]),
    copyTargetFor,
  });
}
