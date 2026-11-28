/**
 * The Flint slot of each screen as a habitat of Flint, where Flint stands for the agent the screen shows and answers each cue of
 * `FlintSlotCues.ts` with the same intent on every screen. A cue reaches Flint only when it changes, so a screen whose agent does one thing
 * the whole time sends none: its arrival says it. A slot has content around it, so it keeps Flint inside, never over that content.
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
  [FLINT_SLOT_CUES.FORGE_CHECKS]:        'gate-run',
});

const JOB_CUES: readonly FlintSlotCue[] = [FLINT_SLOT_CUES.AGENT_WRITES, FLINT_SLOT_CUES.AGENT_REVIEWS, FLINT_SLOT_CUES.AGENT_IS_IDLE];

/** What a ticket document's agent does: it reads the repository, writes its document, waits on User's review, is done, or idles. */
const DOCUMENT_AGENT_CUES: readonly FlintSlotCue[] = [
  FLINT_SLOT_CUES.AGENT_READS,
  FLINT_SLOT_CUES.AGENT_WRITES,
  FLINT_SLOT_CUES.AGENT_WAITS_ON_USER,
  FLINT_SLOT_CUES.AGENT_IS_DONE,
  FLINT_SLOT_CUES.AGENT_IS_IDLE,
];

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
    onArrival:   'greet',
  }),
  research: slotHabitatOf({
    kind:        'research-slot',
    description: 'The pipeline agent on the Research step: it reads the repository, waits on User\'s answer, is done, or is stopped.',
    cues:        [FLINT_SLOT_CUES.AGENT_READS, FLINT_SLOT_CUES.AGENT_IS_DONE, ...SETUP_STEP_PAUSE_CUES],
  }),
  constitution: slotHabitatOf({
    kind:        'constitution-slot',
    description: 'The pipeline agent on the Constitution step: it drafts the constitution, waits on User\'s answer, has its draft ready, or is stopped.',
    cues:        [FLINT_SLOT_CUES.AGENT_IS_DONE, ...SETUP_STEP_PAUSE_CUES],
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
  specAgent: slotHabitatOf({
    kind:        'spec-agent-slot',
    description: 'The spec agent\'s strip on a ticket\'s spec: it reads the repository, writes the spec, waits on User\'s review, is done, or idles.',
    cues:        DOCUMENT_AGENT_CUES,
  }),
  planAgent: slotHabitatOf({
    kind:        'plan-agent-slot',
    description: 'The plan agent\'s strip on a ticket\'s plan: it reads the repository, writes the plan, waits on User\'s review, is done, or idles.',
    cues:        DOCUMENT_AGENT_CUES,
  }),
  commandWait: slotHabitatOf({
    kind:        'command-wait-slot',
    description: 'The panel over the page while a command waits more than a moment on the forge, which checks before it answers.',
    cues:        [FLINT_SLOT_CUES.FORGE_CHECKS],
    onArrival:   'gate-run',
  }),
});

/** What Flint keeps up in a slot while its cue holds: the slot's answer to a lasting cue, a loop of Flint's; null for a moment. */
export function lastingIntentOf(habitat: SpriteHabitat, cue: FlintSlotCue): SpriteIntent | null {
  if (!LASTING_FLINT_SLOT_CUES.has(cue)) return null;
  return habitat.suggestions.find((suggestion) => suggestion.when === cue)?.respond ?? null;
}
