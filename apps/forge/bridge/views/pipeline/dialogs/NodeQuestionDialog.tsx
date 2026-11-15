/**
 * The dialog of a node that waits on a question: the node's open setup questions as stacked question cards, in place of the node's own
 * dialog, which opens again once nothing on the node is open. It closes once an answer is applied.
 */
import { Dialog } from 'design-system/Dialog';
import { View }   from 'design-system/View';

import type { SetupQuestionCard } from '../agent-panel/PipelineAgentPanelModel.ts';
import { SetupQuestionForm }      from '../agent-panel/SetupQuestionForm.tsx';

export interface NodeQuestionDialogProps {
  readonly nodeTitle: string;
  readonly setupId:   string;
  readonly cards:     readonly SetupQuestionCard[];
  readonly onClose:   () => void;
}

export function NodeQuestionDialog({
  nodeTitle, setupId, cards, onClose
}: NodeQuestionDialogProps) {
  return (
    <Dialog
      title={nodeTitle}
      kicker="Question"
      description="Answer the question to change this step."
      isOpen
      onDismiss={onClose}
      closeLabel="Close"
      width="standard"
    >
      <View gap="sixteen">
        {cards.map((card) => <SetupQuestionForm key={card.questionId} setupId={setupId} card={card} layout="stack" onAnswered={onClose} />)}
      </View>
    </Dialog>
  );
}
