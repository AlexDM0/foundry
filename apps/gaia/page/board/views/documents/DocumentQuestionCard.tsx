/**
 * The document agent's question in its chat (`docs/design/agent-questions.md`): open, a card with its anchor line, the question, its context,
 * the lettered options with what each touches and does to the Acceptance, a note in User's own words and Answer; folded to one line while
 * another question is the one open; answered, what User chose. Answer sends `decision-answer` with the option's letter and the note, or the
 * note alone as free text. Under the document's own "Open questions" heading, the list of its questions, each opening its card.
 */
import { useState } from 'react';

import { PAGE_CONTRACT_VERSIONS }                          from '../../../../src/shared/constants/PageContractVersions.ts';
import type { BoardCommandDocument }                       from '../../../@types/board/BoardCommandDocument.ts';
import type { BoardLineRangeDocument }                     from '../../../@types/board/TicketDocumentsDocument.ts';
import { ChoiceInput, ChoiceMark, ChoiceOption }           from '../../../lib/design-system/DesignSystemInterface.ts';
import { OptionConsequencesUtil, type OptionConsequences } from '../../conversation/OptionConsequencesUtil.ts';
import { CommandButton }                                   from '../../shared/commands/CommandButton.tsx';
import type {
  AnsweredQuestionModel,
  OpenQuestionModel,
  OpenQuestionsListItem,
  QuestionAnchorParts
} from './DocumentQuestionsModel.ts';
import { AGENT_NAMES }        from './ProposalModel.ts';
import type { DocumentPlace } from './TicketDocumentCommands.ts';

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

/**
 * Under an option's label, its Recommended mark, then what it touches and does to the Acceptance, one short line each: the rail's narrow
 * card has no room for a mark column or the fact table of a question's card elsewhere.
 */
function OptionFactLines({ consequences, recommended }: { readonly consequences: OptionConsequences | null; readonly recommended: boolean }) {
  return (
    <span className="board-document-question-facts">
      {recommended ? <ChoiceMark mark="recommended" text="Recommended" /> : null}
      {(consequences === null ? [] : OptionConsequencesUtil.factLinesOf(consequences)).map((line) => {
        switch (line.fact) {
          case 'touches':
            return (
              <span key={line.fact}>
                {'Touches '}
                {line.paths.map((path, position) => (
                  <span key={path}>
                    {position === 0 ? null : ', '}
                    <span className="board-document-mono board-document-question-path">{path}</span>
                  </span>
                ))}
              </span>
            );
          case 'tradeOff':
            return <span key={line.fact}>{`Trade-off: ${line.text}`}</span>;
          case 'acceptanceEffect':
            return <span key={line.fact}>{line.text}</span>;
        }
      })}
    </span>
  );
}

function answerCommandOf(decisionId: string, chosenLetter: string | null, note: string): BoardCommandDocument | null {
  const trimmedNote = note.trim();
  const base = { boardCommandVersion: PAGE_CONTRACT_VERSIONS.gaiaBoardCommand, kind: 'decision-answer', decisionId } as const;
  if (chosenLetter !== null) return { ...base, answer: { form: 'letters', choices: [chosenLetter], ...(trimmedNote === '' ? {} : { note: trimmedNote }) } };
  return trimmedNote === '' ? null : { ...base, answer: { form: 'text', text: trimmedNote } };
}

export interface OpenQuestionCardProps {
  readonly place:          DocumentPlace;
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
  place, question, expanded, onExpand, onJumpToAnchor, settled
}: OpenQuestionCardProps) {
  const [chosenLetter, setChosenLetter] = useState<string | null>(question.recommendedLetter);
  const [note, setNote] = useState('');
  if (!expanded) return <FoldedQuestionCard question={question} onExpand={onExpand} />;
  const chosen = question.options.find((option) => option.letter === chosenLetter) ?? null;
  const noteFieldId = `${questionCardIdOf(question.decisionId)}-note`;
  const command = settled ? null : answerCommandOf(question.decisionId, chosenLetter, note);
  return (
    <section id={questionCardIdOf(question.decisionId)} className="board-document-question" data-state="open" aria-label={`Question ${question.decisionId}`}>
      <AnchorLine parts={question.anchorParts} placement={question.placement} onJumpToAnchor={onJumpToAnchor} />
      <span className="board-document-question-text">{question.question}</span>
      {question.context === null ? null : <span className="board-document-question-context">{question.context}</span>}
      <div className="board-document-question-options" role="radiogroup" aria-label={`Answers to ${question.decisionId}`}>
        {question.options.map((option) => (
          <ChoiceOption
            key={option.letter}
            letter={option.letterText}
            label={option.label}
            {...(option.description === '' ? {} : { description: option.description })}
            chosen={option.letter === chosenLetter}
            {...(option.consequences === null && !option.recommended ? {} : { facts: <OptionFactLines consequences={option.consequences} recommended={option.recommended} /> })}
            variant="card"
            tone="question"
            input={(
              <ChoiceInput
                type="radio"
                name={`${question.decisionId}-answer`}
                checked={option.letter === chosenLetter}
                accessibleName={`${option.letterText}. ${option.label}`}
                disabled={settled}
                onChange={() => setChosenLetter(option.letter)}
              />
            )}
          />
        ))}
      </div>
      <label className="board-document-micro" htmlFor={noteFieldId}>Or answer in your own words</label>
      <textarea
        id={noteFieldId}
        className="board-textarea board-document-question-note"
        rows={2}
        placeholder={`Optional note for the ${AGENT_NAMES[place.document].toLowerCase()}`}
        value={note}
        disabled={settled}
        onChange={(event) => setNote(event.currentTarget.value)}
      />
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
