/** The read-only form a filing draft opens: head, facts, its Request as the user wrote it, then its Questions tree. */
import { ChoiceOption }                                                     from '../../design-system/ChoiceOption.tsx';
import { MonoId }                                                           from '../../design-system/MonoId.tsx';
import { StatePill }                                                        from '../../design-system/StatePill.tsx';
import { TitledBlock }                                                      from '../../design-system/TitledBlock.tsx';
import { DetailFacts }                                                      from './DetailParts.tsx';
import { NO_QUESTION_TEXT, type DraftDetailModel, type DraftQuestionModel } from './DraftDetailModel.ts';

function DraftQuestions({ questions }: { readonly questions: readonly DraftQuestionModel[] }) {
  if (questions.length === 0) return null;
  return (
    <ol className="bridge-draft-questions">
      {questions.map((question) => (
        <li key={question.id} className="bridge-draft-question" data-open={question.isOpen ? '' : undefined}>
          <p className="bridge-draft-question-head">
            <MonoId text={question.id} />
            <span>{question.question}</span>
            {question.isMultiple ? <span className="bridge-draft-mark" data-mark="multiple">multi-select</span> : null}
          </p>
          {question.context === '' ? null : <p className="bridge-draft-context">{question.context}</p>}
          {question.options.length === 0 ? null : (
            <ol className="bridge-draft-options">
              {question.options.map((option) => (
                <ChoiceOption
                  key={option.letter}
                  letter={option.letter}
                  label={option.text}
                  chosen={option.isChosen}
                  variant="row"
                  marks={(
                    <>
                      {option.isRecommended ? <span className="bridge-draft-mark" data-mark="recommended">recommended</span> : null}
                      {option.isChosen ? <span className="bridge-draft-mark" data-mark="chosen">chosen</span> : null}
                    </>
                  )}
                />
              ))}
            </ol>
          )}
          <p className="bridge-draft-answer" data-open={question.isOpen ? '' : undefined}><b>answer</b>{question.answerText}</p>
          <DraftQuestions questions={question.followUps} />
        </li>
      ))}
    </ol>
  );
}

export function DraftDetail({ model }: { readonly model: DraftDetailModel }) {
  return (
    <>
      <div className="bridge-detail-head" data-state="draft">
        <span className="bridge-detail-id">{model.idText}</span>
        <h2 className="bridge-detail-title">{model.title}</h2>
        <StatePill label={model.stateWord} />
      </div>
      <DetailFacts facts={model.facts} />
      <TitledBlock title="Request" rule="above">
        <p className="bridge-draft-request">{model.request}</p>
      </TitledBlock>
      <TitledBlock title="Questions" rule="above">
        {model.questions.length === 0 ? <p className="bridge-draft-empty">{NO_QUESTION_TEXT}</p> : <DraftQuestions questions={model.questions} />}
      </TitledBlock>
    </>
  );
}
