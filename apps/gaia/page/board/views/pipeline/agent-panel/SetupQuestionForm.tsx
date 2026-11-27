/**
 * One setup question as a question card: nothing starts chosen and the recommended option is marked, Answer sends the chosen letters or the Other text as
 * `pipeline-setup-answer`, and the card turns into its answered confirmation once the answer is applied. A refusal shows verbatim.
 */
import { useState }                                                    from 'react';
import { MultipleChoiceQuestion, QuestionOption, QuestionOtherOption } from '../../../../lib/design-system/DesignSystemInterface.ts';

import { useControlCommand }                                                   from '../../../shared/commands/ControlCommandSender.ts';
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
  const [chosen, setChosen] = useState<readonly string[]>([]);
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
    <div className="board-pipeline-agent-question">
      <MultipleChoiceQuestion
        eyebrow={card.eyebrow}
        question={card.question}
        context={card.context}
        multiple={card.isMultiple}
        columns={layout === 'columns'}
        chosen={chosen}
        onChoose={(letter) => setChosen(PipelineAgentPanelModel.choiceAfterChoosing(card, chosen, letter))}
        answerLabel="Answer"
        onAnswer={() => void sender.send()}
        {...(answeredText === null ? {} : { answeredText })}
        disabled={sendingIsBlocked}
      >
        {card.options.map((option) => (
          <QuestionOption
            key={option.letter}
            letter={option.letter}
            label={option.text}
            {...(card.recommendedLetters.includes(option.letter) ? { recommendedLabel: 'Recommended' } : {})}
          />
        ))}
        <QuestionOtherOption
          letter={card.otherLetter}
          label={OTHER_OPTION_LABEL}
          placeholder="Describe another way"
          textLabel="Other answer"
          text={otherText}
          onText={setOtherText}
        />
      </MultipleChoiceQuestion>
      {sender.refusal === null ? null : <span className="board-refusal" role="status">{sender.refusal}</span>}
    </div>
  );
}
