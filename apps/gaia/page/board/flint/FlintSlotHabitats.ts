/**
 * The Flint slot of each screen as a habitat of Flint (`flint/`): there Flint stands for the agent the screen shows. Every slot answers a
 * cue of `FlintSlotCues.ts` with the same intent: an agent that reads the repository researches, one that writes types, one that reviews
 * reviews with the looking glass, one that drafts thinks, one that waits on User holds up the "?" card, a finished proposal is happy, and
 * an idle agent lets Flint rest. Flint waves when it arrives in a slot, except in the slot of the Constitution step, where the agent drafts:
 * there it thinks. A screen whose agent does one thing the whole time, the Setup step's, sends no cue, since a cue reaches Flint only when
 * it changes: its arrival says it. Each setup step's slot also answers a question that waits on User and a stopped agent. A slot has
 * content around it, so it keeps Flint inside: Flint pops in through its edge and never shows over that content.
 */
import {
  ARRIVED_CUE,
  type SpriteHabitat,
  type SpriteIntent,
  type SpriteSuggestion
} from '../../lib/flint/FlintInterface.ts';
import { FLINT_SLOT_CUES, LASTING_FLINT_SLOT_CUES, type FlintSlotCue } from './FlintSlotCues.ts';

const SLOT_CUE_ANSWERS: Readonly<Record<FlintSlotCue, SpriteIntent>> = Object.freeze({
  [FLINT_SLOT_CUES.AGENT_READS]:         'research',
  [FLINT_SLOT_CUES.AGENT_WRITES]:        'type',
  [FLINT_SLOT_CUES.AGENT_REVIEWS]:       'review',
  [FLINT_SLOT_CUES.AGENT_THINKS]:        'thinking',
  [FLINT_SLOT_CUES.AGENT_WAITS_ON_USER]: 'ask',
  [FLINT_SLOT_CUES.AGENT_IS_DONE]:       'happy',
  [FLINT_SLOT_CUES.AGENT_IS_IDLE]:       'wander',
});

const JOB_CUES: readonly FlintSlotCue[] = [FLINT_SLOT_CUES.AGENT_WRITES, FLINT_SLOT_CUES.AGENT_REVIEWS, FLINT_SLOT_CUES.AGENT_IS_IDLE];

/** What every setup step's agent strip may say besides its work: a question waits on User, or the agent is stopped. */
const SETUP_STEP_PAUSE_CUES: readonly FlintSlotCue[] = [FLINT_SLOT_CUES.AGENT_WAITS_ON_USER, FLINT_SLOT_CUES.AGENT_IS_IDLE];

interface SlotHabitatSource {
  readonly kind:        string;
  readonly description: string;
  /** The cues the screen sends. */
  readonly cues:        readonly FlintSlotCue[];
  readonly onArrival?:  SpriteIntent;
}

function slotHabitatOf({
  kind, description, cues, onArrival = 'wave'
}: SlotHabitatSource): SpriteHabitat {
  return Object.freeze({
    kind,
    description,
    keepsFlintInside: true,
    suggestions:      Object.freeze<SpriteSuggestion[]>([
      { when: ARRIVED_CUE, respond: onArrival },
      ...cues.map((cue) => ({ when: cue, respond: SLOT_CUE_ANSWERS[cue] })),
    ]),
  });
}

export const FLINT_SLOT_HABITATS = Object.freeze({
  setup: slotHabitatOf({
    kind:        'setup-slot',
    description: 'The pipeline agent on the Setup step, before it starts: Flint meets User.',
    cues:        [],
  }),
  research: slotHabitatOf({
    kind:        'research-slot',
    description: 'The pipeline agent on the Research step: it reads the repository, waits on User\'s answer, or is stopped.',
    cues:        [FLINT_SLOT_CUES.AGENT_READS, ...SETUP_STEP_PAUSE_CUES],
  }),
  constitution: slotHabitatOf({
    kind:        'constitution-slot',
    description: 'The pipeline agent on the Constitution step: it drafts the constitution, waits on User\'s answer, or is stopped.',
    cues:        SETUP_STEP_PAUSE_CUES,
    onArrival:   'thinking',
  }),
  pipelineDesign: slotHabitatOf({
    kind:        'pipeline-design-slot',
    description: 'The pipeline agent on the Pipeline design step: it designs, waits on User\'s answer, has its proposal ready, or is stopped.',
    cues:        [FLINT_SLOT_CUES.AGENT_THINKS, FLINT_SLOT_CUES.AGENT_WAITS_ON_USER, FLINT_SLOT_CUES.AGENT_IS_DONE, FLINT_SLOT_CUES.AGENT_IS_IDLE],
  }),
  kanban: slotHabitatOf({
    kind:        'kanban-slot',
    description: 'The Kanban\'s "Agents at work" strip: the first running job builds or reviews, or no job runs.',
    cues:        JOB_CUES,
  }),
  ticketDetail: slotHabitatOf({
    kind:        'ticket-detail-slot',
    description: 'The state card of a ticket\'s detail: the ticket\'s job builds or reviews, or no job works on it.',
    cues:        JOB_CUES,
  }),
  agents: slotHabitatOf({
    kind:        'agent-job-slot',
    description: 'The side panel of the job selected on Agents: its agent builds or reviews, or it does not run.',
    cues:        JOB_CUES,
  }),
  assistant: slotHabitatOf({
    kind:        'assistant-slot',
    description: 'The Assistant\'s chat head: a decision it put to User waits, or it idles.',
    cues:        [FLINT_SLOT_CUES.AGENT_WAITS_ON_USER, FLINT_SLOT_CUES.AGENT_IS_IDLE],
  }),
  questions: slotHabitatOf({
    kind:        'question-slot',
    description: 'The decision card of the question panel, where the agent that asks waits on User\'s answer.',
    cues:        [FLINT_SLOT_CUES.AGENT_WAITS_ON_USER],
  }),
  intake: slotHabitatOf({
    kind:        'intake-slot',
    description: 'The product owner\'s turn at the end of the intake chat, while it writes.',
    cues:        [FLINT_SLOT_CUES.AGENT_WRITES],
  }),
});

/** What Flint keeps up in a slot while its cue holds: the slot's answer to a lasting cue, a loop of Flint's; null for a moment. */
export function lastingIntentOf(habitat: SpriteHabitat, cue: FlintSlotCue): SpriteIntent | null {
  if (!LASTING_FLINT_SLOT_CUES.has(cue)) return null;
  return habitat.suggestions.find((suggestion) => suggestion.when === cue)?.respond ?? null;
}
