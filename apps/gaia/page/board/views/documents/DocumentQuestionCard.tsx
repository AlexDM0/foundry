/**
 * The document agent's question in its chat (`docs/design/agent-questions.md`): open, a card with its anchor line, the question, its context,
 * the lettered options with what each touches and does to the Acceptance, User's own words as an option of their own, and Answer; folded
 * to one line while another question is the one open; answered, what User chose. Answer sends `decision-answer` with the chosen option's
 * letter, or User's words as free text. Under the document's own "Open questions" heading, the list of its questions, each opening its card.
 */
import { useMemo } from 'react';

import type { BoardLineRangeDocument }                 from '../../../@types/board/TicketDocumentsDocument.ts';
import { DecisionAnswerUtil }                          from '../../conversation/DecisionAnswerUtil.ts';
import { DecisionOptionList, type DecisionOptionLook } from '../../conversation/DecisionOptionList.tsx';
import { useDecisionAnswer }                           from '../../conversation/UseDecisionAnswer.ts';
import { CommandButton }                               from '../../shared/commands/CommandButton.tsx';
import type {
  AnsweredQuestionModel,
  OpenQuestionModel,
  OpenQuestionsListItem,
  QuestionAnchorParts
} from './DocumentQuestionsModel.ts';

const DOCUMENT_CARD_LOOK: DecisionOptionLook = { variant: 'card', tone: 'question', facts: 'lines' };

/** The id each question's card carries, so its item under "Open questions" can bring it into view. */
export function questionCardIdOf(decisionId: string): string {
  return `document-question-${decisionId}`;
}

/** "E7 · § 3 Behaviour · line 16", the id and the lines in the mono face. */
function AnchorText({ parts }: { readonly parts: QuestionAnchorParts }) {
  return (
    <>
      <span className="board-document-mono board-document-question-name">{parts.questionName}</span>
      {parts.section === null ? null : ` · ${parts.section}`}
      {' · '}
      <span className="board-document-mono">{parts.linesText}</span>
    </>
  );
}

function AnchorLine({ parts, placement, onJumpToAnchor }: {
  readonly parts:          QuestionAnchorParts;
  readonly placement:      BoardLineRangeDocument | null;
  readonly onJumpToAnchor: (lines: BoardLineRangeDocument) => void;
}) {
  const content = (
    <>
      <AnchorText parts={parts} />
      {placement === null ? ' · gone from the head' : null}
    </>
  );
  if (placement === null) return <span className="board-document-question-anchor">{content}</span>;
  return (
    <button type="button" className="board-document-question-anchor" aria-label={`Show line of ${parts.questionName}`} onClick={() => onJumpToAnchor(placement)}>
      {content}
    </button>
  );
}

export interface OpenQuestionCardProps {
  readonly question:       OpenQuestionModel;
  /** Folded, the card is one line that opens it; one question is open at a time. */
  readonly expanded:       boolean;
  readonly onExpand:       (decisionId: string) => void;
  readonly onJumpToAnchor: (lines: BoardLineRangeDocument) => void;
  /** The document can no longer change: the card offers no answer. */
  readonly settled:        boolean;
}

function FoldedQuestionCard({ question, onExpand }: Pick<OpenQuestionCardProps, 'question' | 'onExpand'>) {
  const summary = question.options.map((option) => `${option.letterText} · ${option.label}`).join(' · ');
  return (
    <button
      type="button"
      id={questionCardIdOf(question.decisionId)}
      className="board-document-question"
      data-folded=""
      aria-label={`Open question ${question.decisionId}: ${question.question}`}
      onClick={() => onExpand(question.decisionId)}
    >
      <span className="board-document-question-anchor"><AnchorText parts={question.anchorParts} /></span>
      <span className="board-document-question-text">{question.question}</span>
      <span className="board-document-question-context">{summary}</span>
    </button>
  );
}

export function OpenQuestionCard({
  question, expanded, onExpand, onJumpToAnchor, settled
}: OpenQuestionCardProps) {
  const questions = useMemo(() => [{ multiSelect: false, options: question.options }], [question.options]);
  const decisionAnswer = useDecisionAnswer(questions);
  if (!expanded) return <FoldedQuestionCard question={question} onExpand={onExpand} />;
  const chosenIndex = decisionAnswer.selections[0]?.[0];
  const chosen = chosenIndex === undefined ? null : question.options[chosenIndex] ?? null;
  const command = settled ? null : DecisionAnswerUtil.commandOf(question.decisionId, decisionAnswer.answer);
  return (
    <section id={questionCardIdOf(question.decisionId)} className="board-document-question" data-state="open" aria-label={`Question ${question.decisionId}`}>
      <AnchorLine parts={question.anchorParts} placement={question.placement} onJumpToAnchor={onJumpToAnchor} />
      <span className="board-document-question-text">{question.question}</span>
      {question.context === null ? null : <span className="board-document-question-context">{question.context}</span>}
      <div className="board-document-question-options" role="radiogroup" aria-label={`Answers to ${question.decisionId}`}>
        <DecisionOptionList
          groupName={`${question.decisionId}-answer`}
          question={questions[0] ?? { multiSelect: false, options: question.options }}
          chosen={decisionAnswer.selections[0] ?? []}
          onChoose={(optionIndex) => decisionAnswer.chooseOption(0, optionIndex)}
          freeText={{
            text: decisionAnswer.freeText, isChosen: decisionAnswer.freeTextIsChosen, onToggle: decisionAnswer.toggleFreeText, onChange: decisionAnswer.changeFreeText
          }}
          look={DOCUMENT_CARD_LOOK}
          shownLetterOf={(letter) => letter.toUpperCase()}
          disabled={settled}
        />
      </div>
      <div className="board-document-question-foot">
        <span className="board-document-note">The answer goes on the ticket and to the agent.</span>
        <CommandButton label={chosen === null ? 'Answer' : `Answer ${chosen.letterText}`} command={command} primary compact />
      </div>
    </section>
  );
}

export function AnsweredQuestionCard({ answered, onJumpToAnchor }: {
  readonly answered:       AnsweredQuestionModel;
  readonly onJumpToAnchor: (lines: BoardLineRangeDocument) => void;
}) {
  return (
    <section id={questionCardIdOf(answered.decisionId)} className="board-document-question" data-state="answered" aria-label={`Question ${answered.decisionId}, answered`}>
      {answered.anchorParts === null ? null : <AnchorLine parts={answered.anchorParts} placement={answered.placement} onJumpToAnchor={onJumpToAnchor} />}
      <span className="board-document-question-text">{answered.question}</span>
      <span className="board-document-question-answer">
        <span className="board-document-question-check" aria-hidden="true">✓</span>
        <span>
          {'You answered '}
          <strong>{answered.answerText}</strong>
        </span>
      </span>
      {answered.note === null ? null : <span className="board-document-question-context">{`“${answered.note}”`}</span>}
      {answered.waitsForAgent ? <span className="board-document-note">Goes to the agent once it ends its turn.</span> : null}
    </section>
  );
}

/** The questions listed under the document's "Open questions" heading: each id opens its card in the chat. */
export function OpenQuestionsList({ items, onShowQuestion }: {
  readonly items:          readonly OpenQuestionsListItem[];
  readonly onShowQuestion: (decisionId: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <ul className="board-document-open-questions" aria-label="The agent's questions">
      {items.map((item) => (
        <li key={item.decisionId} className="board-document-open-question">
          <button type="button" className="board-document-mono board-document-question-link" onClick={() => onShowQuestion(item.decisionId)}>
            {item.decisionId}
          </button>
          {` ${item.text}`}
          {item.waitsOnUser ? <span className="board-document-question-waits">{' waiting on you'}</span> : null}
        </li>
      ))}
    </ul>
  );
}
