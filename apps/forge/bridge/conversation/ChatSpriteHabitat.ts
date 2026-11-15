/**
 * The chat thread as a habitat of Flint (`flint/`): there Flint pretends to be the agent that User talks to. The cues are this habitat's
 * own names for what its turns show; each suggestion answers one with a move of Flint's fixed list.
 */
import type { SpriteCue, SpriteHabitat, SpriteSuggestion } from 'flint/SpriteHabitat';
import { ARRIVED_CUE }                                     from 'flint/SpriteHabitat';

export const CHAT_CUES = Object.freeze({
  AGENT_IS_THINKING:     'agent-is-thinking',
  AGENT_IS_WRITING:      'agent-is-writing',
  AGENT_CALLS_A_TOOL:    'agent-calls-a-tool',
  AGENT_ASKS_A_QUESTION: 'agent-asks-a-question',
  AGENT_FAILED:          'agent-failed',
  AGENT_IS_DONE:         'agent-is-done',
  USER_IS_TYPING:        'user-is-typing',
  DRAFT_IS_RESEARCHING:  'draft-is-researching',
} satisfies Readonly<Record<string, SpriteCue>>);

export const CHAT_SPRITE_HABITAT: SpriteHabitat = Object.freeze({
  kind:        'chat',
  description: 'A conversation between User and one agent session: its turns, its tool calls and the questions it asks.',
  suggestions: Object.freeze<SpriteSuggestion[]>([
    { when: ARRIVED_CUE, respond: 'wave' },
    { when: CHAT_CUES.AGENT_IS_THINKING, respond: 'thinking' },
    { when: CHAT_CUES.AGENT_IS_WRITING, respond: 'type', note: 'The agent writes its answer.' },
    { when: CHAT_CUES.AGENT_CALLS_A_TOOL, respond: 'fasten' },
    { when: CHAT_CUES.AGENT_ASKS_A_QUESTION, respond: 'doubt', note: 'Then look at the composer, where User answers.' },
    { when: CHAT_CUES.AGENT_FAILED, respond: 'sweatdrop' },
    { when: CHAT_CUES.AGENT_IS_DONE, respond: 'happy' },
    { when: CHAT_CUES.DRAFT_IS_RESEARCHING, respond: 'research', note: 'A filing draft is researched: no question of it waits on User.' },
  ]),
});
