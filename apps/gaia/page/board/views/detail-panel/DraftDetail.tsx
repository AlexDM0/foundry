/** The read-only form a filing draft opens: head, facts, its Request as the user wrote it, then its Questions tree. */
import {
  ChoiceOption,
  MonoId,
  StatePill,
  TitledBlock
} from '../../../lib/design-system/DesignSystemInterface.ts';

import { StateToneUtil }                                                    from '../../utils/StateToneUtil.ts';
import { DetailFacts }                                                      from './DetailParts.tsx';
import { NO_QUESTION_TEXT, type DraftDetailModel, type DraftQuestionModel } from './DraftDetailModel.ts';

function DraftQuestions({ questions }: { readonly questions: readonly DraftQuestionModel[] }) {
  if (questions.length === 0) return null;
  return (
    <ol className="board-draft-questions">
      {questions.map((question) => (
        <li key={question.id} className="board-draft-question" data-open={question.isOpen ? '' : undefined}>
          <p className="board-draft-question-head">
            <MonoId text={question.id} />
            <span>{question.question}</span>
            {question.isMultiple ? <span className="board-draft-mark" data-mark="multiple">multi-select</span> : null}
          </p>
          {question.context === '' ? null : <p className="board-draft-context">{question.context}</p>}
          {question.options.length === 0 ? null : (
            <ol className="board-draft-options">
              {question.options.map((option) => (
                <ChoiceOption
                  key={option.letter}
                  letter={option.letter}
                  label={option.text}
                  chosen={option.isChosen}
                  variant="row"
                  marks={(
                    <>
                      {option.isRecommended ? <span className="board-draft-mark" data-mark="recommended">recommended</span> : null}
                      {option.isChosen ? <span className="board-draft-mark" data-mark="chosen">chosen</span> : null}
                    </>
                  )}
                />
              ))}
            </ol>
          )}
          <p className="board-draft-answer" data-open={question.isOpen ? '' : undefined}><b>answer</b>{question.answerText}</p>
          <DraftQuestions questions={question.followUps} />
        </li>
      ))}
    </ol>
  );
}

export function DraftDetail({ model }: { readonly model: DraftDetailModel }) {
  return (
    <>
      <div className="board-detail-head" data-state="draft" data-state-tone={StateToneUtil.toneOf('draft')}>
        <span className="board-detail-id">{model.idText}</span>
        <h2 className="board-detail-title">{model.title}</h2>
        <StatePill label={model.stateWord} {...StateToneUtil.pillLookOf('draft')} />
      </div>
      <DetailFacts facts={model.facts} />
      <TitledBlock title="Request" rule="above">
        <p className="board-draft-request">{model.request}</p>
      </TitledBlock>
      <TitledBlock title="Questions" rule="above">
        {model.questions.length === 0 ? <p className="board-draft-empty">{NO_QUESTION_TEXT}</p> : <DraftQuestions questions={model.questions} />}
      </TitledBlock>
    </>
  );
}
