/**
 * The document agent's questions (artboard 11). What matters: an open question is a decision of this ticket's shown document only, its
 * options lettered for the forge and shown in capitals, its section read from the head, so the document's title never leads it; an answer
 * is the message naming its decision, read from the forge's parts, so free text with a blank line stays one answer; each has a solid
 * chip on its line, `E7` open and `✓ E7` answered, in the applied look once its answer settles, which an edit applied, discarded or
 * conflicted does, as does the end of the agent's turn with no edit for it; its lines are marked until then; it lists under the document's
 * own Open questions heading; and a line picks the question whose lines hold it.
 */
import { describe, expect, test } from 'bun:test';

import { MarkdownBlocks }                     from '../../../../src/lib/markdown-render/MarkdownBlocks.ts';
import type { BoardDocumentProposalDocument } from '../../../@types/board/TicketDocumentsDocument.ts';
import {
  DOCUMENTS_TICKET_ID,
  FALLBACK_LINE,
  lineOf,
  SAVED_CHOICE_QUESTION,
  SPEC_ASKS_DOCUMENTS,
  SPEC_MARKDOWN_ASKS
} from '../../testing/TicketDocumentsFixture.ts';
import { DocumentQuestionsModel, type DocumentQuestions } from './DocumentQuestionsModel.ts';

const BLOCKS = MarkdownBlocks.blocksOf(SPEC_MARKDOWN_ASKS);

const IMAGES_LINE = lineOf(SPEC_MARKDOWN_ASKS, '**A4**');

function questionsOf(decisions = [SAVED_CHOICE_QUESTION], document: 'spec' | 'plan' = 'spec'): DocumentQuestions {
  return DocumentQuestionsModel.documentQuestionsOf({
    decisions, messages: SPEC_ASKS_DOCUMENTS.documents[0]?.messages ?? [], ticketId: DOCUMENTS_TICKET_ID, document, blocks: BLOCKS,
  });
}

describe('an open question', () => {
  test('is a decision the agent asked on this ticket\'s shown document, with its options lettered and its section read from the head', () => {
    const [open] = questionsOf().open;
    expect(open).toMatchObject({
      decisionId:  'E7',
      question:    'Does this ticket add the saved theme choice?',
      context:     'The repo stores no theme choice today. The old site\'s dark mode lived in a cookie that the new storefront never reads.',
      anchorParts: { questionName: 'E7', section: '§ 3 Behaviour', linesText: `line ${FALLBACK_LINE}` },
      placement:   { from: FALLBACK_LINE, to: FALLBACK_LINE },
    });
    expect(open?.options.map((option) => [option.letter, option.letterText, option.recommended])).toEqual([['a', 'A', true], ['b', 'B', false], ['c', 'C', false]]);
  });

  test('of another document, another ticket or no document is not this page\'s', () => {
    expect(questionsOf([SAVED_CHOICE_QUESTION], 'plan').open).toEqual([]);
    expect(questionsOf([{ ...SAVED_CHOICE_QUESTION, ticketIds: ['007'] }]).open).toEqual([]);
    expect(questionsOf([{
      ...SAVED_CHOICE_QUESTION, document: null, anchor: null, placement: null
    }]).open).toEqual([]);
  });

  test('stands in the order the agent asked, and gives no context where the agent gave none', () => {
    const questions = questionsOf([{ ...SAVED_CHOICE_QUESTION, id: 'E12' }, { ...SAVED_CHOICE_QUESTION, id: 'E9', context: ' ' }]).open;
    expect(questions.map((question) => [question.decisionId, question.context === null])).toEqual([['E9', true], ['E12', false]]);
  });
});

describe('an answered question', () => {
  test('reads the forge\'s answer message as the question, the chosen label and User\'s note', () => {
    expect(questionsOf().answered).toEqual([{
      decisionId:    'E8',
      messageId:     'M2',
      question:      'Do product images in order history get a dark variant?',
      answerText:    'Keep their colours, as A4 says',
      note:          'Product photos are the merchant\'s; we do not touch them.',
      anchorParts:   { questionName: 'E8', section: '§ 4 Acceptance › A4', linesText: `line ${IMAGES_LINE}` },
      placement:     { from: IMAGES_LINE, to: IMAGES_LINE },
      waitsForAgent: false,
      applied:       false,
      settled:       false,
    }]);
  });

  test('an answer of free text is User\'s own words whole, its blank lines kept, with no note, and lists with one period', () => {
    const [answerMessage] = (SPEC_ASKS_DOCUMENTS.documents[0]?.messages ?? []).filter((message) => message.decisionId !== null);
    if (answerMessage === undefined) throw new Error('The fixture has no answer.');
    const freeText = {
      ...answerMessage,
      answer: { question: 'Which store?', choice: null, note: 'Neither.\n\nUse the OS setting and drop the cookie.' },
      text:   'Which store?\nNeither.\n\nUse the OS setting and drop the cookie.',
    };
    const questions = DocumentQuestionsModel.documentQuestionsOf({
      decisions: [], messages: [freeText], ticketId: DOCUMENTS_TICKET_ID, document: 'spec', blocks: BLOCKS,
    });
    expect(questions.answered[0]).toMatchObject({ question: 'Which store?', answerText: 'Neither.\n\nUse the OS setting and drop the cookie.', note: null });
    expect(DocumentQuestionsModel.openQuestionsListOf(questions)[0]?.text).toBe('Answered: Neither.\n\nUse the OS setting and drop the cookie.');
  });
});

describe('an answer settles', () => {
  const [answerMessage] = (SPEC_ASKS_DOCUMENTS.documents[0]?.messages ?? []).filter((message) => message.decisionId !== null);
  if (answerMessage === undefined) throw new Error('The fixture has no answer.');
  const editFor = (state: 'proposed' | 'discarded' | 'conflicted'): BoardDocumentProposalDocument => ({
    proposalId:       'P3',
    jobId:            'J9',
    baseNumber:       4,
    edits:            [],
    summary:          'Keep the images',
    answersMessageId: answerMessage.messageId,
    forSpecNumber:    null,
    state,
    appliedNumber:    null,
    at:               '2026-11-24T13:10:00',
    headLines:        null,
  });
  const settledOf = (reading: Partial<Parameters<typeof DocumentQuestionsModel.documentQuestionsOf>[0]>): boolean | undefined => DocumentQuestionsModel.documentQuestionsOf({
    decisions: [], messages: [answerMessage], ticketId: DOCUMENTS_TICKET_ID, document: 'spec', blocks: BLOCKS, ...reading,
  }).answered[0]?.settled;

  test('once the agent\'s turn on it ended with no edit for it, and not while that turn runs or before it shows', () => {
    expect(settledOf({ agentTurns: { newestTurn: 2, working: false } })).toBe(true);
    expect(settledOf({ agentTurns: { newestTurn: 2, working: true } })).toBe(false);
    expect(settledOf({ agentTurns: { newestTurn: 1, working: false } })).toBe(false);
    expect(settledOf({ agentTurns: null })).toBe(false);
  });

  test('once its edit is discarded or conflicted, and not while the edit waits for Apply', () => {
    expect(settledOf({ proposals: [editFor('discarded')] })).toBe(true);
    expect(settledOf({ proposals: [editFor('conflicted')] })).toBe(true);
    expect(settledOf({ proposals: [editFor('proposed')], agentTurns: { newestTurn: 2, working: false } })).toBe(false);
  });

  test('takes the applied look and leaves the lines and the Open questions list', () => {
    const questions = DocumentQuestionsModel.documentQuestionsOf({
      decisions: [SAVED_CHOICE_QUESTION], messages: [answerMessage], agentTurns: { newestTurn: 2, working: false }, ticketId: DOCUMENTS_TICKET_ID, document: 'spec', blocks: BLOCKS,
    });
    expect(DocumentQuestionsModel.chipsOf(questions).map((chip) => [chip.text, chip.asks, chip.applied])).toEqual([['E7', true, false], ['✓ E8', false, true]]);
    expect(DocumentQuestionsModel.questionedLinesOf(questions)).toEqual([{ from: FALLBACK_LINE, to: FALLBACK_LINE }]);
    expect(DocumentQuestionsModel.openQuestionsListOf(questions).map((item) => item.decisionId)).toEqual(['E7']);
  });
});

describe('the marks in the document', () => {
  test('an open question has a solid E7 on its line, an answered one a solid ✓ E8, in the applied look once its edit is applied', () => {
    const questions = questionsOf();
    expect(DocumentQuestionsModel.chipsOf(questions).map((chip) => [chip.text, chip.line, chip.asks, chip.applied])).toEqual([
      ['E7', FALLBACK_LINE, true, false],
      ['✓ E8', IMAGES_LINE, true, false],
    ]);
    const applied = { ...questions, answered: questions.answered.map((answered) => ({ ...answered, applied: true, settled: true })) };
    expect(DocumentQuestionsModel.chipsOf(applied).map((chip) => [chip.text, chip.asks, chip.applied])).toEqual([['E7', true, false], ['✓ E8', false, true]]);
  });

  test('marks the lines of each question until its answer\'s edit is applied', () => {
    const questions = questionsOf();
    expect(DocumentQuestionsModel.questionedLinesOf(questions)).toEqual([{ from: FALLBACK_LINE, to: FALLBACK_LINE }, { from: IMAGES_LINE, to: IMAGES_LINE }]);
    const applied = { ...questions, answered: questions.answered.map((answered) => ({ ...answered, applied: true, settled: true })) };
    expect(DocumentQuestionsModel.questionedLinesOf(applied)).toEqual([{ from: FALLBACK_LINE, to: FALLBACK_LINE }]);
  });

  test('lists each question under the document\'s own Open questions heading, in asking order, until its edit is applied', () => {
    expect(DocumentQuestionsModel.openQuestionsHeadingLineOf(SPEC_MARKDOWN_ASKS)).toBe(lineOf(SPEC_MARKDOWN_ASKS, '## 6 Open questions'));
    expect(DocumentQuestionsModel.openQuestionsHeadingLineOf('# Spec\n\n## Behaviour')).toBeNull();
    expect(DocumentQuestionsModel.openQuestionsListOf(questionsOf())).toEqual([
      { decisionId: 'E7', text: 'Does this ticket add the saved theme choice?', waitsOnUser: true },
      { decisionId: 'E8', text: 'Answered: Keep their colours, as A4 says.', waitsOnUser: false },
    ]);
  });
});

describe('the question a line opens', () => {
  test('is the open question whose lines hold it, else the first open one', () => {
    const second = { ...SAVED_CHOICE_QUESTION, id: 'E9', placement: { from: IMAGES_LINE, to: IMAGES_LINE } };
    const { open } = questionsOf([SAVED_CHOICE_QUESTION, second]);
    expect(DocumentQuestionsModel.questionAtLineOf(open, IMAGES_LINE)?.decisionId).toBe('E9');
    expect(DocumentQuestionsModel.questionAtLineOf(open, 1)?.decisionId).toBe('E7');
    expect(DocumentQuestionsModel.questionAtLineOf(open, null)?.decisionId).toBe('E7');
    expect(DocumentQuestionsModel.questionAtLineOf([], 3)).toBeNull();
  });

  test('the head counts the open questions', () => {
    expect([0, 1, 2].map(DocumentQuestionsModel.openCountTextOf)).toEqual([null, '1 question open', '2 questions open']);
  });
});
