/**
 * The pipeline agent panel's model, pure: the chat the agent's transcript reads as, the line of what the agent does while a turn runs, the
 * setup questions of one step worded as question cards, and the commands an answer and a message send. Questions are setup questions in
 * the record, never decisions: an answer is `pipeline-setup-answer`, a message `job-message` to the agent's job.
 */
import type { JobState }                                          from '../../../../src/lib/tracker-model/@types/Job.ts';
import type { ResearchFinding, SetupQuestion, SetupQuestionStep } from '../../../../src/lib/tracker-model/@types/PipelineSetup.ts';
import type { DisplayState }                                      from '../../../../src/lib/tracker-model/@types/Task.ts';
import type { ControlCommandBody }                                from '../../../api/CommandClient.ts';
import type { TranscriptEntryDocument }                           from '../../../api/TranscriptStreamClient.ts';
import type { ChatTurn }                                          from '../../../conversation/ChatThread.tsx';
import { ChatThreadModelUtil }                                    from '../../../conversation/ChatThreadModel.ts';
import { ChatTurnWordingUtil }                                    from '../../../conversation/ChatTurnWordingUtil.ts';
import type { QuestionOption }                                    from '../../../design-system/MultipleChoiceQuestion.tsx';
import type { TagProps }                                          from '../../../design-system/Tag.tsx';

export const PIPELINE_AGENT_SPEAKER = 'Pipeline agent';

const USER_SPEAKER = 'User';

/** The palette row a pipeline agent turn's dot takes. */
const PIPELINE_AGENT_TURN_STATE: DisplayState = 'in-progress';

/** Said while a turn runs and its newest entry holds no line of prose and no tool call. */
const WORKING_TEXT = 'Working…';

export const OTHER_OPTION_LABEL = 'Other';

const LETTER_CODE_OF_A = 'a'.charCodeAt(0);

const STOPPED_TAG: TagProps = {
  text: 'Stopped: a message resumes it', tone: 'state', state: 'abandoned', dot: true
};

const RUNNING_TAG: TagProps = {
  text: 'Running', tone: 'state', state: 'in-progress', dot: true
};

export interface SetupQuestionCard {
  readonly questionId:         string;
  readonly eyebrow:            string;
  readonly question:           string;
  readonly context:            string;
  readonly options:            readonly QuestionOption[];
  readonly recommendedLetters: readonly string[];
  /** Several options may be chosen together; the Other text is still an answer of its own. */
  readonly isMultiple:         boolean;
  /** The Other option's letter: the one after the options' own. */
  readonly otherLetter:        string;
  /** The confirmation of a stored answer; `null` while the question is open. */
  readonly answeredText:       string | null;
}

/** The chat of the agent's session: the Overseer's lines as system lines, User's messages as bubbles, the agent's turns with their tools. */
function chatTurnsOf(entries: readonly TranscriptEntryDocument[], agentJobId: string, todayCalendarDate: string): ChatTurn[] {
  const bootLineText = `Overseer started ${agentJobId} for the pipeline setup`;
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
function activityLineOf(entries: readonly TranscriptEntryDocument[]): string | null {
  const newest = ChatThreadModelUtil.threadItemsOf(entries, []).at(-1);
  if (newest?.kind !== 'agent-turn' || !newest.working) return null;
  const line = lastLineOf(newest.prose);
  if (line !== null) return line;
  const lastCall = newest.toolFold?.calls.at(-1);
  if (lastCall === undefined) return WORKING_TEXT;
  return lastCall.state === 'running' ? `${lastCall.toolName} running…` : `${lastCall.toolName} done…`;
}

function eyebrowOf(question: SetupQuestion, findings: readonly ResearchFinding[]): string {
  const { subject } = question;
  if (subject === null) return 'Question';
  if (subject.kind === 'finding') {
    const finding = findings.find((candidate) => candidate.findingId === subject.reference);
    return finding === undefined ? 'Question' : `Question · ${finding.label}`;
  }
  return `Question · ${subject.kind} ${subject.reference}`;
}

function otherLetterOf(question: SetupQuestion): string {
  return String.fromCharCode(LETTER_CODE_OF_A + question.options.length);
}

type GivenAnswer = { readonly letters: readonly string[] } | { readonly text: string };

/** "Answered: Yes, in the merge phase", the chosen options' texts in the order given, or the free text. */
function answeredTextOf(options: readonly { readonly letter: string; readonly text: string }[], answer: GivenAnswer): string {
  if ('text' in answer) return `Answered: ${answer.text}`;
  const texts = answer.letters.map((letter) => options.find((option) => option.letter === letter)?.text ?? letter);
  return `Answered: ${texts.join(', ')}`;
}

function questionCardOf(question: SetupQuestion, findings: readonly ResearchFinding[]): SetupQuestionCard {
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
function questionCardsOf(questions: readonly SetupQuestion[], step: SetupQuestionStep, findings: readonly ResearchFinding[]): SetupQuestionCard[] {
  return questions.filter((question) => question.step === step).map((question) => questionCardOf(question, findings));
}

/** The open questions among the ids a flow node names, in the order asked. */
function openQuestionCardsOf(questions: readonly SetupQuestion[], questionIds: readonly string[], findings: readonly ResearchFinding[]): SetupQuestionCard[] {
  return questions
    .filter((question) => question.answer === null && questionIds.includes(question.questionId))
    .map((question) => questionCardOf(question, findings));
}

/** The ids of the questions with no answer yet, on every step. */
function openQuestionIdsOf(questions: readonly SetupQuestion[]): string[] {
  return questions.filter((question) => question.answer === null).map((question) => question.questionId);
}

/** The first recommended option starts chosen, as drawn, and on a multiple question every recommended one in option order; with none, none. */
function initialChoiceOf(card: SetupQuestionCard): string[] {
  if (card.isMultiple) return card.options.map((option) => option.letter).filter((letter) => card.recommendedLetters.includes(letter));
  return card.recommendedLetters.slice(0, 1);
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

function answerCommandOf(setupId: string, card: SetupQuestionCard, chosen: readonly string[], otherText: string): ControlCommandBody | null {
  const answer = answerOf(card, chosen, otherText);
  if (answer === null) return null;
  return {
    kind:       'pipeline-setup-answer',
    setupId,
    questionId: card.questionId,
    answer:     'text' in answer ? { form: 'text', text: answer.text } : { form: 'letters', choices: answer.letters },
  };
}

/** The confirmation a card shows once its answer was applied, before the facts carry the stored answer. */
function answeredTextAfterSending(card: SetupQuestionCard, chosen: readonly string[], otherText: string): string | null {
  const answer = answerOf(card, chosen, otherText);
  return answer === null ? null : answeredTextOf(card.options, answer);
}

/** A message reopens a stopped agent, so it sends whenever the setup has an agent job and the text holds more than blanks. */
function messageCommandOf(agentJobId: string | null, text: string): ControlCommandBody | null {
  const message = text.trim();
  if (agentJobId === null || message === '') return null;
  return { kind: 'job-message', jobId: agentJobId, text: message };
}

function composerTagOf(agentJobState: JobState | null): TagProps {
  return agentJobState === null ? STOPPED_TAG : RUNNING_TAG;
}

export const PipelineAgentPanelModel = Object.freeze({
  chatTurnsOf,
  activityLineOf,
  questionCardsOf,
  openQuestionCardsOf,
  openQuestionIdsOf,
  initialChoiceOf,
  choiceAfterChoosing,
  answerCommandOf,
  answeredTextAfterSending,
  messageCommandOf,
  composerTagOf,
});
