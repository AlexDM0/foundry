/**
 * One setup question as a question card: the recommended option starts chosen, Answer sends the chosen letter or the Other text as
 * `pipeline-setup-answer`, and the card turns into its answered confirmation once the answer is applied. A refusal shows verbatim.
 */
import { useState } from 'react';

import { MultipleChoiceQuestion }                                              from '../../../design-system/MultipleChoiceQuestion.tsx';
import { useControlCommand }                                                   from '../../../shell/ControlCommandSender.ts';
import { OTHER_OPTION_LABEL, PipelineAgentPanelModel, type SetupQuestionCard } from './PipelineAgentPanelModel.ts';

export interface SetupQuestionFormProps {
  readonly setupId:     string;
  readonly card:        SetupQuestionCard;
  readonly layout:      'columns' | 'stack';
  /** Called once the answer was applied, so a holder such as a dialog can close. */
  readonly onAnswered?: () => void;
}

export function SetupQuestionForm({
  setupId, card, layout, onAnswered
}: SetupQuestionFormProps) {
  const [chosen, setChosen] = useState<string | null>(() => PipelineAgentPanelModel.initialChoiceOf(card));
  const [otherText, setOtherText] = useState('');
  const [sentAnswerText, setSentAnswerText] = useState<string | null>(null);
  const command = PipelineAgentPanelModel.answerCommandOf(setupId, card, chosen, otherText);
  const sender = useControlCommand(command, {
    onApplied: () => {
      setSentAnswerText(PipelineAgentPanelModel.answeredTextAfterSending(card, chosen, otherText));
      onAnswered?.();
    },
  });
  const answeredText = card.answeredText ?? sentAnswerText;
  // An incomplete answer leaves the card open to choose in; the card's own Answer stays disabled then.
  const sendingIsBlocked = command !== null && !sender.enabled;
  return (
    <div className="bridge-pipeline-agent-question">
      <MultipleChoiceQuestion
        eyebrow={card.eyebrow}
        question={card.question}
        options={card.options}
        recommendedLetters={card.recommendedLetters}
        recommendedLabel="Recommended"
        otherLetter={card.otherLetter}
        otherLabel={OTHER_OPTION_LABEL}
        otherPlaceholder="Describe another way"
        otherTextLabel="Other answer"
        layout={layout}
        chosen={chosen}
        onChoose={setChosen}
        otherText={otherText}
        onOtherText={setOtherText}
        answerLabel="Answer"
        onAnswer={() => void sender.send()}
        {...(answeredText === null ? {} : { answeredText })}
        disabled={sendingIsBlocked}
      />
      {card.context === '' || answeredText !== null ? null : <p className="bridge-pipeline-agent-question-context">{card.context}</p>}
      {sender.refusal === null ? null : <span className="bridge-refusal" role="status">{sender.refusal}</span>}
    </div>
  );
}
