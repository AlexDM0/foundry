/**
 * The Questions view and the question panel as the questions habitat of Flint, where Flint waits on User's answers: it asks, knocks on a
 * decision left waiting, lights an incident's fuse, signs a granted waiver, and is happy when a decision is answered.
 */
import {
  ARRIVED_CUE,
  type SpriteCue,
  type SpriteHabitat,
  type SpriteSuggestion
} from '../../lib/flint/FlintInterface.ts';

export const QUESTIONS_CUES = Object.freeze({
  DECISION_WAITS:         'decision-waits',
  OLDEST_DECISION_PASSED: 'oldest-decision-passed',
  INCIDENT_OPENED:        'incident-opened',
  INCIDENT_SETTLED:       'incident-settled',
  WAIVER_ANSWERED:        'waiver-answered',
  DECISION_ANSWERED:      'decision-answered',
} satisfies Readonly<Record<string, SpriteCue>>);

export const QUESTIONS_SPRITE_HABITAT: SpriteHabitat = Object.freeze({
  kind:        'questions',
  description: 'The questions that wait on User: the open decisions, the answered ones and the notices.',
  suggestions: Object.freeze<SpriteSuggestion[]>([
    { when: ARRIVED_CUE, respond: 'wave' },
    { when: QUESTIONS_CUES.DECISION_WAITS, respond: 'ask', note: 'A decision is open and User has none in view.' },
    { when: QUESTIONS_CUES.OLDEST_DECISION_PASSED, respond: 'ask-knock', note: 'User looked at other questions twice and the oldest still waits.', },
    { when: QUESTIONS_CUES.INCIDENT_OPENED, respond: 'incident-fuse', note: 'An incident opened; it takes its default move unless handled.' },
    { when: QUESTIONS_CUES.INCIDENT_SETTLED, respond: 'happy', note: 'An incident was handled, answered or took its default move.' },
    { when: QUESTIONS_CUES.WAIVER_ANSWERED, respond: 'waiver', note: 'User answered a waiver.' },
    { when: QUESTIONS_CUES.DECISION_ANSWERED, respond: 'happy', note: 'A decision that is not a waiver was answered.' },
  ]),
});
