/**
 * The pipeline agent panel's model, pure: the chat the agent's transcript reads as, the line of what the agent does while a turn runs, the
 * setup questions of one step worded as question cards, and the commands an answer and a message send. Questions are setup questions in
 * the record, never decisions: an answer is `pipeline-setup-answer`, a message `job-message` to the agent's job. The agent strip above
 * the composer says what the agent does on each step, beside Flint's slot: the habitat of the step, with its cue. In monorepo mode the
 * panel holds the session of one level, the forge's or one entity's: its job, its questions and its findings, never another level's; the
 * open questions of the other levels are only counted and linked.
 */

import { PAGE_CONTRACT_VERSIONS }    from '../../../../../src/shared/constants/PageContractVersions.ts';
import type { BoardCommandDocument } from '../../../../@types/board/BoardCommandDocument.ts';
import type {
  BoardPipelineSetupDocument,
  BoardResearchFindingDocument,
  BoardSetupQuestionDocument,
  BoardSetupRecordDocument
} from '../../../../@types/board/BoardPipelineDocuments.ts';
import type { BoardDisplayState, BoardJobState, BoardSetupQuestionStep } from '../../../../@types/board/BoardVocabulary.ts';
import type { BoardTranscriptEntryDocument }                             from '../../../../@types/board/ConversationDocument.ts';
import type { TagProps }                                                 from '../../../../lib/design-system/DesignSystemInterface.ts';
import type { SpriteHabitat }                                            from '../../../../lib/flint/FlintInterface.ts';
import { CountTextUtil }                                                 from '../../../../shared/utils/CountTextUtil.ts';
import type { ChatTurn }                                                 from '../../../conversation/ChatThread.tsx';
import { ChatThreadModelUtil }                                           from '../../../conversation/ChatThreadModel.ts';
import { ChatTurnWordingUtil }                                           from '../../../conversation/ChatTurnWordingUtil.ts';
import { FLINT_SLOT_CUES, type FlintSlotCue }                            from '../../../flint/FlintSlotCues.ts';
import { FLINT_SLOT_HABITATS }                                           from '../../../flint/FlintSlotHabitats.ts';
import { StateToneUtil }                                                 from '../../../utils/StateToneUtil.ts';
import { FORGE_LEVEL, PipelineLevelModel, type PipelineLevel }           from '../entities/PipelineLevelModel.ts';
import { AgentSessionModel, type AgentSessionState, type SessionJob }    from './AgentSessionModel.ts';

export const PIPELINE_AGENT_SPEAKER = 'Pipeline agent';

const USER_SPEAKER = 'User';

/** The palette row a pipeline agent turn's dot takes. */
const PIPELINE_AGENT_TURN_STATE: BoardDisplayState = 'in-progress';

/** Said while a turn runs and its newest entry holds no line of prose and no tool call. */
const WORKING_TEXT = 'Working…';

export const OTHER_OPTION_LABEL = 'Other';

const LETTER_CODE_OF_A = 'a'.charCodeAt(0);

const STOPPED_TAG: TagProps = { text: 'Stopped: a message resumes it', ...StateToneUtil.tagLookOf('abandoned'), dot: true };

const RUNNING_TAG: TagProps = { text: 'Running', ...StateToneUtil.tagLookOf('in-progress'), dot: true };

/** One lettered option of a setup question card. */
interface SetupQuestionOption {
  readonly letter: string;
  readonly text:   string;
}

export interface SetupQuestionCard {
  readonly questionId:         string;
  readonly eyebrow:            string;
  readonly question:           string;
  readonly context:            string;
  readonly options:            readonly SetupQuestionOption[];
  readonly recommendedLetters: readonly string[];
  /** Several options may be chosen together; the Other text is still an answer of its own. */
  readonly isMultiple:         boolean;
  /** The Other option's letter: the one after the options' own. */
  readonly otherLetter:        string;
  /** The confirmation of a stored answer; `null` while the question is open. */
  readonly answeredText:       string | null;
}

/** The agent strip's words, and the habitat of Flint's slot on the step with its cue. */
export interface AgentStripView {
  readonly text:         string;
  readonly flintHabitat: SpriteHabitat;
  /** `null` on a step whose agent does one thing the whole time: Flint's arrival in the slot says it. */
  readonly flintCue:     FlintSlotCue | null;
  /** The entity whose codebase an entity's research session reads, set in mono after the words: "Reading web". */
  readonly entityKey?:   string;
}

const RESEARCH_STRIP: AgentStripView = { text: 'Reading the repository', flintHabitat: FLINT_SLOT_HABITATS.research, flintCue: FLINT_SLOT_CUES.AGENT_READS, };

/** On the entities step the agent turns the layout research found into entities, in the research slot. */
const ENTITIES_STRIP: AgentStripView = { text: 'Proposing the entities', flintHabitat: FLINT_SLOT_HABITATS.research, flintCue: FLINT_SLOT_CUES.AGENT_READS, };

const CONSTITUTION_STRIP: AgentStripView = { text: 'Drafting the constitution', flintHabitat: FLINT_SLOT_HABITATS.constitution, flintCue: null, };

const DESIGNING_STRIP: AgentStripView = { text: 'Designing the pipeline', flintHabitat: FLINT_SLOT_HABITATS.pipelineDesign, flintCue: FLINT_SLOT_CUES.AGENT_THINKS, };

const PROPOSAL_READY_STRIP: AgentStripView = { text: 'Proposal ready', flintHabitat: FLINT_SLOT_HABITATS.pipelineDesign, flintCue: FLINT_SLOT_CUES.AGENT_IS_DONE, };

const QUESTION_OPEN_TEXT = 'Waiting for your answer';

/** An entity's research session reads only its own codebase, which the strip names after this word. */
const ENTITY_RESEARCH_TEXT = 'Reading';

/** The panel head's word for an agent with no job on the board. */
const STOPPED_TEXT = 'Stopped';

const NOT_LAUNCHED_TEXT = 'Not launched';

const WORKING_STRIPS: Readonly<Record<BoardSetupQuestionStep, AgentStripView>> = Object.freeze({
  research:     RESEARCH_STRIP,
  entities:     ENTITIES_STRIP,
  constitution: CONSTITUTION_STRIP,
  design:       DESIGNING_STRIP,
});

/** The chat of the agent's session: Hephaestus's lines as system lines, User's messages as bubbles, the agent's turns with their tools. */
function chatTurnsOf(entries: readonly BoardTranscriptEntryDocument[], agentJobId: string, todayCalendarDate: string): ChatTurn[] {
  const bootLineText = `Hephaestus started ${agentJobId} for the pipeline setup`;
  return ChatThreadModelUtil.threadItemsOf(entries, []).map((item): ChatTurn => {
    const stamp = ChatTurnWordingUtil.stampOf(item.at, todayCalendarDate);
    switch (item.kind) {
      case 'system':
        return {
          kind: 'system', key: item.key, text: ChatTurnWordingUtil.systemLineTextOf(item.facts, bootLineText), stamp, revealText: item.revealText
        };
      case 'user-message':
        return {
          kind: 'user', key: item.key, speaker: USER_SPEAKER, stamp, stampSuffix: null, text: item.text, queued: null, pictures: null
        };
      case 'agent-turn':
        return {
          kind:        'agent',
          key:         item.key,
          speaker:     PIPELINE_AGENT_SPEAKER,
          state:       PIPELINE_AGENT_TURN_STATE,
          stamp,
          workingText: item.working ? 'working' : null,
          toolUse:     item.toolFold === null ? null : ChatTurnWordingUtil.toolUseOf(item.toolFold, item.working),
          prose:       item.prose,
        };
    }
  });
}

function lastLineOf(prose: string): string | null {
  const lines = prose.split('\n').map((line) => line.trim()).filter((line) => line !== '');
  return lines.at(-1) ?? null;
}

/**
 * What the agent does now, while its newest turn runs: the last line it wrote in that turn, else its last tool call, else that it works;
 * `null` once the turn ended, so nothing shows between turns.
 */
function activityLineOf(entries: readonly BoardTranscriptEntryDocument[]): string | null {
  const newest = ChatThreadModelUtil.threadItemsOf(entries, []).at(-1);
  if (newest?.kind !== 'agent-turn' || !newest.working) return null;
  const line = lastLineOf(newest.prose);
  if (line !== null) return line;
  const lastCall = newest.toolFold?.calls.at(-1);
  if (lastCall === undefined) return WORKING_TEXT;
  return lastCall.state === 'running' ? `${lastCall.toolName} running…` : `${lastCall.toolName} done…`;
}

function eyebrowOf(question: BoardSetupQuestionDocument, findings: readonly BoardResearchFindingDocument[]): string {
  const { subject } = question;
  if (subject === null) return 'Question';
  if (subject.kind === 'finding') {
    const finding = findings.find((candidate) => candidate.findingId === subject.reference);
    return finding === undefined ? 'Question' : `Question · ${finding.label}`;
  }
  return `Question · ${subject.kind} ${subject.reference}`;
}

function otherLetterOf(question: BoardSetupQuestionDocument): string {
  return String.fromCharCode(LETTER_CODE_OF_A + question.options.length);
}

type GivenAnswer = { readonly letters: readonly string[] } | { readonly text: string };

/** "Answered: Yes, in the merge phase", the chosen options' texts in the order given, or the free text. */
function answeredTextOf(options: readonly { readonly letter: string; readonly text: string }[], answer: GivenAnswer): string {
  if ('text' in answer) return `Answered: ${answer.text}`;
  const texts = answer.letters.map((letter) => options.find((option) => option.letter === letter)?.text ?? letter);
  return `Answered: ${texts.join(', ')}`;
}

function questionCardOf(question: BoardSetupQuestionDocument, findings: readonly BoardResearchFindingDocument[]): SetupQuestionCard {
  return {
    questionId:         question.questionId,
    eyebrow:            eyebrowOf(question, findings),
    question:           question.question,
    context:            question.context,
    options:            question.options.map((option) => ({ letter: option.letter, text: option.text })),
    recommendedLetters: question.recommended,
    isMultiple:         question.multiple,
    otherLetter:        otherLetterOf(question),
    answeredText:       question.answer === null ? null : answeredTextOf(question.options, question.answer),
  };
}

/** The questions the step asked, in the order asked, open and answered alike: an answered one shows its confirmation. */
function questionCardsOf(questions: readonly BoardSetupQuestionDocument[], step: BoardSetupQuestionStep, findings: readonly BoardResearchFindingDocument[]): SetupQuestionCard[] {
  return questions.filter((question) => question.step === step).map((question) => questionCardOf(question, findings));
}

/** The open questions among the ids a flow node names, in the order asked. */
function openQuestionCardsOf(
  questions: readonly BoardSetupQuestionDocument[],
  questionIds: readonly string[],
  findings: readonly BoardResearchFindingDocument[],
): SetupQuestionCard[] {
  return questions
    .filter((question) => question.answer === null && questionIds.includes(question.questionId))
    .map((question) => questionCardOf(question, findings));
}

/** The ids of the questions with no answer yet, on every step. */
function openQuestionIdsOf(questions: readonly BoardSetupQuestionDocument[]): string[] {
  return questions.filter((question) => question.answer === null).map((question) => question.questionId);
}

/**
 * The letters chosen after choosing one: a single question takes the letter alone; a multiple question toggles it, and since an answer is
 * either letters or the Other text, choosing Other drops the letters and choosing a letter drops Other.
 */
function choiceAfterChoosing(card: SetupQuestionCard, chosen: readonly string[], letter: string): string[] {
  if (!card.isMultiple) return [letter];
  if (letter === card.otherLetter) return chosen.includes(letter) ? [] : [letter];
  const letters = chosen.filter((chosenLetter) => chosenLetter !== card.otherLetter);
  if (letters.includes(letter)) return letters.filter((chosenLetter) => chosenLetter !== letter);
  return card.options.map((option) => option.letter).filter((optionLetter) => optionLetter === letter || letters.includes(optionLetter));
}

/** The Other option sends its text, any other the chosen letters; nothing while no option is chosen or the Other text is empty. */
function answerOf(card: SetupQuestionCard, chosen: readonly string[], otherText: string): GivenAnswer | null {
  if (chosen.length === 0) return null;
  if (!chosen.includes(card.otherLetter)) return { letters: [...chosen] };
  const text = otherText.trim();
  return text === '' ? null : { text };
}

function answerCommandOf(setupId: string, card: SetupQuestionCard, chosen: readonly string[], otherText: string): BoardCommandDocument | null {
  const answer = answerOf(card, chosen, otherText);
  if (answer === null) return null;
  return {
    boardCommandVersion: PAGE_CONTRACT_VERSIONS.gaiaBoardCommand,
    kind:                'pipeline-setup-answer',
    setupId,
    questionId:          card.questionId,
    answer:              'text' in answer ? { form: 'text', text: answer.text } : { form: 'letters', choices: answer.letters },
  };
}

/** The confirmation a card shows once its answer was applied, before the facts carry the stored answer. */
function answeredTextAfterSending(card: SetupQuestionCard, chosen: readonly string[], otherText: string): string | null {
  const answer = answerOf(card, chosen, otherText);
  return answer === null ? null : answeredTextOf(card.options, answer);
}

/** A message reopens a stopped agent, so it sends whenever the setup has an agent job and the text holds more than blanks. */
function messageCommandOf(agentJobId: string | null, text: string): BoardCommandDocument | null {
  const message = text.trim();
  if (agentJobId === null || message === '') return null;
  return {
    boardCommandVersion: PAGE_CONTRACT_VERSIONS.gaiaBoardCommand, kind: 'job-message', jobId: agentJobId, text: message, pictures: [], incidentId: null
  };
}

/**
 * A question of the step that waits on User comes first, on every step; the design then says its proposal is ready once the agent suggests
 * to continue past the design, as the panel head does; an agent whose launch forge refused, or a stopped one, shows no work; else research reads, the
 * constitution drafts and the design designs. An entity's research session reads that entity, which the strip names.
 */
function agentStripOf(
  step: BoardSetupQuestionStep,
  record: { readonly questions: readonly BoardSetupQuestionDocument[]; readonly readyToContinue: BoardSetupRecordDocument['readyToContinue'] },
  sessionState: AgentSessionState,
  entityKey: string | null = null
): AgentStripView {
  const { flintHabitat } = WORKING_STRIPS[step];
  const questionIsOpen = record.questions.some((question) => question.step === step && question.answer === null);
  if (questionIsOpen) return { text: QUESTION_OPEN_TEXT, flintHabitat, flintCue: FLINT_SLOT_CUES.AGENT_WAITS_ON_USER };
  if (step === 'design' && record.readyToContinue.includes('design')) return PROPOSAL_READY_STRIP;
  if (sessionState === 'not-launched') return { text: NOT_LAUNCHED_TEXT, flintHabitat, flintCue: FLINT_SLOT_CUES.AGENT_IS_IDLE };
  if (sessionState === 'stopped') return { text: STOPPED_TEXT, flintHabitat, flintCue: FLINT_SLOT_CUES.AGENT_IS_IDLE };
  if (step === 'research' && entityKey !== null) return { ...RESEARCH_STRIP, text: ENTITY_RESEARCH_TEXT, entityKey };
  return WORKING_STRIPS[step];
}

const NOT_LAUNCHED_TAG: TagProps = { text: 'Not launched', tone: 'error' };

/** A job whose launch forge refused reads as not launched, never as the Running its state names. */
function composerTagOf(sessionState: AgentSessionState): TagProps {
  if (sessionState === 'not-launched') return NOT_LAUNCHED_TAG;
  return sessionState === 'stopped' ? STOPPED_TAG : RUNNING_TAG;
}

/** The session one level's chat holds: its agent's job, the session's state, and the questions and findings of that session alone. */
export interface LevelSession {
  readonly agentJobId:   string | null;
  readonly sessionState: AgentSessionState;
  readonly questions:    readonly BoardSetupQuestionDocument[];
  readonly findings:     readonly BoardResearchFindingDocument[];
}

/** The line over the chat that counts the open questions of the other levels, each level a link. */
export interface OtherLevelQuestionsView {
  readonly text:   string;
  readonly levels: readonly PipelineLevel[];
}

type LevelSessionFacts = Pick<BoardPipelineSetupDocument, 'record' | 'agentJobState' | 'entities'>;

const PANEL_TITLE = PIPELINE_AGENT_SPEAKER;

interface LevelPart {
  readonly agentJobId:    string | null;
  readonly agentJobState: BoardJobState | null;
  readonly questions:     readonly BoardSetupQuestionDocument[];
  readonly findings:      readonly BoardResearchFindingDocument[];
}

/** The forge's part is the record's own; an entity's is its part of the record, with no job and no question until it has one. */
function levelPartOf(setup: LevelSessionFacts, level: PipelineLevel | null): LevelPart {
  const { record } = setup;
  if (level === null || PipelineLevelModel.isForgeLevel(level)) {
    return {
      agentJobId: record.agentJobId, agentJobState: setup.agentJobState, questions: record.questions, findings: record.findings
    };
  }
  const entityParts = record.entities ?? {};
  const part = Object.hasOwn(entityParts, level.key) ? entityParts[level.key] : undefined;
  const entityFacts = setup.entities ?? {};
  const facts = Object.hasOwn(entityFacts, level.key) ? entityFacts[level.key] : undefined;
  return {
    agentJobId:    part?.agentJobId ?? null,
    agentJobState: facts?.agentJobState ?? null,
    questions:     part?.questions ?? [],
    findings:      part?.findings ?? [],
  };
}

/** The session of one level, its state read with the board's jobs, so a job whose launch forge refused reads as not launched. */
function levelSessionOf(setup: LevelSessionFacts, level: PipelineLevel | null, jobs: readonly SessionJob[]): LevelSession {
  const part = levelPartOf(setup, level);
  return {
    agentJobId:   part.agentJobId,
    sessionState: AgentSessionModel.sessionStateOf(part.agentJobId, part.agentJobState, jobs),
    questions:    part.questions,
    findings:     part.findings,
  };
}

function openCountOf(questions: readonly BoardSetupQuestionDocument[]): number {
  return questions.filter((question) => question.answer === null).length;
}

function questionCountTextOf(count: number): string {
  return CountTextUtil.countedPhrase(count, 'question', 'questions');
}

/** Where the other levels' questions are: "in another entity", "in other entities", "in an entity", "at the Forge level", "at other levels". */
function placeTextOf(level: PipelineLevel, levels: readonly PipelineLevel[]): string {
  const forgeIsAmong = levels.some(PipelineLevelModel.isForgeLevel);
  if (forgeIsAmong) return levels.length === 1 ? 'at the Forge level' : 'at other levels';
  if (PipelineLevelModel.isForgeLevel(level)) return levels.length === 1 ? 'in an entity' : 'in entities';
  return levels.length === 1 ? 'in another entity' : 'in other entities';
}

/** The open questions of every level but the one shown, the forge first; `null` while no other level asks. */
function otherLevelQuestionsOf(setup: LevelSessionFacts, level: PipelineLevel): OtherLevelQuestionsView | null {
  const entityKeys = Object.keys(setup.record.entities ?? {});
  const counted = [FORGE_LEVEL, ...entityKeys.map((key) => PipelineLevelModel.entityLevelOf(key))]
    .filter((other) => !PipelineLevelModel.levelsAreEqual(other, level))
    .map((other) => ({ level: other, openCount: openCountOf(levelPartOf(setup, other).questions) }))
    .filter((entry) => entry.openCount > 0);
  if (counted.length === 0) return null;
  const levels = counted.map((entry) => entry.level);
  const total = counted.reduce((sum, entry) => sum + entry.openCount, 0);
  return { text: `${questionCountTextOf(total)} ${placeTextOf(level, levels)}`, levels };
}

/** "Pipeline agent" in single mode, "Pipeline agent · web" or "Pipeline agent · Forge" at a level. */
function panelTitleOf(level: PipelineLevel | null): string {
  return level === null ? PANEL_TITLE : `${PANEL_TITLE} · ${PipelineLevelModel.levelNameOf(level)}`;
}

export const PipelineAgentPanelModel = Object.freeze({
  levelSessionOf,
  otherLevelQuestionsOf,
  panelTitleOf,
  chatTurnsOf,
  activityLineOf,
  questionCardsOf,
  openQuestionCardsOf,
  openQuestionIdsOf,
  choiceAfterChoosing,
  answerCommandOf,
  answeredTextAfterSending,
  messageCommandOf,
  composerTagOf,
  agentStripOf,
});
