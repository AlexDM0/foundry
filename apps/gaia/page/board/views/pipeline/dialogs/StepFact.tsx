/** One line of a step dialog's facts, such as when the step runs: the term in bold, what it says muted beside it. */
import { Row, Text } from '../../../../lib/design-system/DesignSystemInterface.ts';

export interface StepFactProps {
  readonly term:        string;
  readonly description: string;
}

export function StepFact({ term, description }: StepFactProps) {
  return (
    <Row gap="ten" paddingVertical="eight">
      <Text bold>{term}</Text>
      <Text muted>{description}</Text>
    </Row>
  );
}
