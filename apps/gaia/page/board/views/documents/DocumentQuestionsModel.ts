/**
 * The document agent's questions to User on its document, pure (`docs/design/agent-questions.md`). An open question is an open decision the
 * spec or plan agent asked on this ticket's document; an answered one is the document's message that carries its decision id, which the
 * forge words as the question's line, then the chosen label, then User's note after a blank line. Each question has its `E<n>` chip on the
 * line its anchor stands on now and its lines marked, and lists under the document's own "Open questions" heading until the agent's edit
 * for its answer is applied.
 */
import type { MarkdownBlock }                                        from '../../../../src/lib/markdown-render/MarkdownBlocks.ts';
import type { BoardDecisionDocument, BoardDecisionOptionDocument }   from '../../../@types/board/BoardDecisionDocuments.ts';
import type { BoardTicketDocumentKind }                              from '../../../@types/board/BoardVocabulary.ts';
import type { BoardDocumentMessageDocument, BoardLineRangeDocument } from '../../../@types/board/TicketDocumentsDocument.ts';
import { OptionConsequencesUtil, type OptionConsequences }           from '../../conversation/OptionConsequencesUtil.ts';
import { CommentPopoverModel }                                       from './CommentPopoverModel.ts';
import type { CommentChip }                                          from './DocumentBlocks.tsx';
import { DocumentSelectionModel }                                    from './DocumentSelectionModel.ts';

/** "E7 · § 3 Behaviour · line 16": the question's name and its lines in the mono face, the section in the text face. */
export interface QuestionAnchorParts {
  readonly questionName: string;
  readonly section:      string | null;
  readonly linesText:    string;
}

export interface QuestionOptionModel {
  /** The letter the forge takes the option by: `a`. */
  readonly letter:       string;
  /** The letter as the card shows it: `A`. */
  readonly letterText:   string;
  readonly label:        string;
  readonly description:  string;
  readonly recommended:  boolean;
  readonly consequences: OptionConsequences | null;
}

export interface OpenQuestionModel {
  readonly decisionId:        string;
  readonly question:          string;
  /** Why the agent asks; `null` where it gave no context. */
  readonly context:           string | null;
  readonly options:           readonly QuestionOptionModel[];
  readonly anchorParts:       QuestionAnchorParts;
  /** The question's lines on the head now; `null` once they are gone. */
  readonly placement:         BoardLineRangeDocument | null;
  /** The option the card holds chosen as it opens, the recommended one; `null` with none recommended. */
  readonly recommendedLetter: string | null;
}

export interface AnsweredQuestionModel {
  readonly decisionId:    string;
  readonly messageId:     string;
  readonly question:      string;
  /** The chosen option's label, or User's own words where the answer was free text. */
  readonly answerText:    string;
  readonly note:          string | null;
  readonly anchorParts:   QuestionAnchorParts | null;
  readonly placement:     BoardLineRangeDocument | null;
  /** The answer waits for the agent to finish its turn. */
  readonly waitsForAgent: boolean;
  /** The agent's edit for the answer is applied. */
  readonly applied:       boolean;
}

/** An item under the document's "Open questions" heading. */
export interface OpenQuestionsListItem {
  readonly decisionId:  string;
  readonly text:        string;
  readonly waitsOnUser: boolean;
}

export interface DocumentQuestions {
  readonly open:     readonly OpenQuestionModel[];
  readonly answered: readonly AnsweredQuestionModel[];
}

const FIRST_LETTER_CODE = 'a'.codePointAt(0) ?? 0;

const ANSWER_LINE_SEPARATOR = '\n';

const NOTE_SEPARATOR = '\n\n';

const OPEN_QUESTIONS_HEADING = /^#{1,6}\s+(?:[\d.]+\s+)?Open questions\s*#*\s*$/iu;

function optionOf(option: BoardDecisionOptionDocument, optionIndex: number): QuestionOptionModel {
  const letter = option.letter === '' ? String.fromCodePoint(FIRST_LETTER_CODE + optionIndex) : option.letter;
  return {
    letter,
    letterText:   letter.toUpperCase(),
    label:        option.label,
    description:  option.description,
    recommended:  option.recommended,
    consequences: OptionConsequencesUtil.consequencesOf(option),
  };
}

/** The section is the page's own reading of the head at the lines, as a comment's is, so the document's title never leads it. */
function anchorPartsOf(
  decisionId: string,
  blocks: readonly MarkdownBlock[],
  anchorLines: BoardLineRangeDocument,
  anchorSectionPath: readonly string[],
  placement: BoardLineRangeDocument | null,
): QuestionAnchorParts {
  const sectionPath = placement === null ? anchorSectionPath : DocumentSelectionModel.sectionPathAt(blocks, placement.from);
  return {
    questionName: decisionId,
    section:      CommentPopoverModel.sectionTextOf(sectionPath),
    linesText:    CommentPopoverModel.linesTextOf(placement ?? anchorLines),
  };
}

/** The agent's open questions on this ticket's document, in the order they were asked; a decision of several questions is not one. */
function openQuestionsOf(
  decisions: readonly BoardDecisionDocument[],
  ticketId: string,
  document: BoardTicketDocumentKind,
  blocks: readonly MarkdownBlock[],
): OpenQuestionModel[] {
  return decisions.flatMap((decision): OpenQuestionModel[] => {
    const [asked] = decision.questions;
    if (decision.document !== document || !decision.ticketIds.includes(ticketId) || decision.anchor === null || asked === undefined) return [];
    const options = asked.options.map(optionOf);
    return [{
      decisionId:        decision.id,
      question:          asked.question,
      context:           decision.context.trim() === '' ? null : decision.context.trim(),
      options,
      anchorParts:       anchorPartsOf(decision.id, blocks, decision.anchor.lines, decision.anchor.sectionPath, decision.placement),
      placement:         decision.placement,
      recommendedLetter: options.find((option) => option.recommended)?.letter ?? null,
    }];
  }).toSorted((a, b) => decisionNumberOf(a.decisionId) - decisionNumberOf(b.decisionId));
}

function decisionNumberOf(decisionId: string): number {
  const number = Number(decisionId.replace(/^\D+/u, ''));
  return Number.isFinite(number) ? number : 0;
}

/** "Does this ticket add the saved theme choice?\nYes, add it here\n\nKeep the cookie out of it.", as the forge words an answer. */
function answerPartsOf(text: string): { readonly question: string; readonly answerText: string; readonly note: string | null } {
  const lineEnd = text.indexOf(ANSWER_LINE_SEPARATOR);
  if (lineEnd < 0) return { question: text, answerText: '', note: null };
  const answer = text.slice(lineEnd + ANSWER_LINE_SEPARATOR.length);
  const noteStart = answer.indexOf(NOTE_SEPARATOR);
  const note = noteStart < 0 ? '' : answer.slice(noteStart + NOTE_SEPARATOR.length).trim();
  return {
    question:   text.slice(0, lineEnd),
    answerText: (noteStart < 0 ? answer : answer.slice(0, noteStart)).trim(),
    note:       note === '' ? null : note,
  };
}

function answeredQuestionOf(message: BoardDocumentMessageDocument, blocks: readonly MarkdownBlock[]): AnsweredQuestionModel | null {
  if (message.decisionId === null || message.state === 'withdrawn') return null;
  return {
    decisionId:    message.decisionId,
    messageId:     message.messageId,
    ...answerPartsOf(message.text),
    anchorParts:   message.anchor === null ? null : anchorPartsOf(message.decisionId, blocks, message.anchor.lines, message.anchor.sectionPath, message.placement),
    placement:     message.placement,
    waitsForAgent: message.state === 'queued',
    applied:       message.state === 'applied',
  };
}

function answeredQuestionsOf(messages: readonly BoardDocumentMessageDocument[], blocks: readonly MarkdownBlock[]): AnsweredQuestionModel[] {
  return messages.flatMap((message) => {
    const answered = answeredQuestionOf(message, blocks);
    return answered === null ? [] : [answered];
  });
}

function documentQuestionsOf(reading: {
  readonly decisions: readonly BoardDecisionDocument[];
  readonly messages:  readonly BoardDocumentMessageDocument[];
  readonly ticketId:  string;
  readonly document:  BoardTicketDocumentKind;
  readonly blocks:    readonly MarkdownBlock[];
}): DocumentQuestions {
  return {
    open:     openQuestionsOf(reading.decisions, reading.ticketId, reading.document, reading.blocks),
    answered: answeredQuestionsOf(reading.messages, reading.blocks),
  };
}

/** A solid `E7` on an open question's line, a solid `✓ E7` once answered, and the applied look once the agent's edit for it is applied. */
function chipsOf(questions: DocumentQuestions): CommentChip[] {
  const openChips = questions.open.flatMap((question): CommentChip[] => (question.placement === null ? [] : [{
    key: question.decisionId, line: question.placement.to, text: question.decisionId, applied: false, asks: true, title: `Question ${question.decisionId} for you`,
  }]));
  const answeredChips = questions.answered.flatMap((answered): CommentChip[] => (answered.placement === null ? [] : [{
    key:     answered.messageId,
    line:    answered.placement.to,
    text:    `✓ ${answered.decisionId}`,
    applied: answered.applied,
    asks:    !answered.applied,
    title:   answered.applied ? `Question ${answered.decisionId}, answered and applied` : `Question ${answered.decisionId}, answered`,
  }]));
  return [...openChips, ...answeredChips];
}

/** The lines a question stands on, marked while it is open or its answer is not applied yet. */
function questionedLinesOf(questions: DocumentQuestions): BoardLineRangeDocument[] {
  return [
    ...questions.open.flatMap((question) => (question.placement === null ? [] : [question.placement])),
    ...questions.answered.flatMap((answered) => (answered.placement === null || answered.applied ? [] : [answered.placement])),
  ];
}

/** The line of the document's own "Open questions" heading, such as `## 6 Open questions`; `null` where it has none. */
function openQuestionsHeadingLineOf(markdown: string): number | null {
  const index = markdown.split('\n').findIndex((line) => OPEN_QUESTIONS_HEADING.test(line));
  return index < 0 ? null : index + 1;
}

/** Each open question, then each answered one whose edit is not applied yet: "Answered: Yes, add it here." */
function openQuestionsListOf(questions: DocumentQuestions): OpenQuestionsListItem[] {
  const answeredItemOf = (answered: AnsweredQuestionModel): OpenQuestionsListItem => {
    const text = `Answered: ${answered.answerText}.`;
    return { decisionId: answered.decisionId, text, waitsOnUser: false };
  };
  return [
    ...questions.open.map((question) => ({ decisionId: question.decisionId, text: question.question, waitsOnUser: true })),
    ...questions.answered.filter((answered) => !answered.applied).map(answeredItemOf),
  ].toSorted((a, b) => decisionNumberOf(a.decisionId) - decisionNumberOf(b.decisionId));
}

/** The open question whose lines hold the line, else the first open one; `null` with none open. */
function questionAtLineOf(open: readonly OpenQuestionModel[], line: number | null): OpenQuestionModel | null {
  const atLine = line === null ? undefined : open.find((question) => question.placement !== null && question.placement.from <= line && line <= question.placement.to);
  return atLine ?? open[0] ?? null;
}

/** "2 questions open", `null` with none. */
function openCountTextOf(openCount: number): string | null {
  if (openCount === 0) return null;
  return `${openCount} ${openCount === 1 ? 'question' : 'questions'} open`;
}

export const DocumentQuestionsModel = Object.freeze({
  documentQuestionsOf,
  answerPartsOf,
  chipsOf,
  questionedLinesOf,
  openQuestionsHeadingLineOf,
  openQuestionsListOf,
  questionAtLineOf,
  openCountTextOf,
});
