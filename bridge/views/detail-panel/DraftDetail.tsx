/** The read-only form a filing draft opens: head, facts, its Request as the user wrote it, then its Questions tree. */
import { DetailFacts, DetailSection }                                       from './DetailParts.tsx';
import { NO_QUESTION_TEXT, type DraftDetailModel, type DraftQuestionModel } from './DraftDetailModel.ts';

function DraftQuestions({ questions }: { readonly questions: readonly DraftQuestionModel[] }) {
  if (questions.length === 0) return null;
  return (
    <ol className="bridge-draft-questions">
      {questions.map((question) => (
        <li key={question.id} className="bridge-draft-question" data-open={question.isOpen ? '' : undefined}>
          <p className="bridge-draft-question-head">
            <span className="bridge-ticket-id">{question.id}</span>
            <span>{question.question}</span>
            {question.isMultiple ? <span className="bridge-draft-mark" data-mark="multiple">multi-select</span> : null}
          </p>
          {question.context === '' ? null : <p className="bridge-draft-context">{question.context}</p>}
          {question.options.length === 0 ? null : (
            <ol className="bridge-draft-options">
              {question.options.map((option) => (
                <li key={option.letter} className="bridge-draft-option" data-recommended={option.isRecommended ? '' : undefined} data-chosen={option.isChosen ? '' : undefined}>
                  <span className="bridge-draft-option-letter">{option.letter}</span>
                  <span className="bridge-draft-option-text">{option.text}</span>
                  {option.isRecommended ? <span className="bridge-draft-mark" data-mark="recommended">recommended</span> : null}
                  {option.isChosen ? <span className="bridge-draft-mark" data-mark="chosen">chosen</span> : null}
                </li>
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
        <span className="bridge-state-pill">{model.stateWord}</span>
      </div>
      <DetailFacts facts={model.facts} />
      <DetailSection title="Request">
        <p className="bridge-draft-request">{model.request}</p>
      </DetailSection>
      <DetailSection title="Questions">
        {model.questions.length === 0 ? <p className="bridge-draft-empty">{NO_QUESTION_TEXT}</p> : <DraftQuestions questions={model.questions} />}
      </DetailSection>
    </>
  );
}
