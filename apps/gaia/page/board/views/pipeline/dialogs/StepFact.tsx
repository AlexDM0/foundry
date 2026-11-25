/**
 * One ruled line of a step dialog's facts box: the term in bold in a column of its own, so every description starts at one edge, and what
 * it says muted beside it.
 */
import { Text } from '../../../../lib/design-system/DesignSystemInterface.ts';

export interface StepFactProps {
  readonly term:        string;
  readonly description: string;
}

export function StepFact({ term, description }: StepFactProps) {
  return (
    <div className="board-pipeline-dialog-fact">
      <Text bold>{term}</Text>
      <Text muted>{description}</Text>
    </div>
  );
}
