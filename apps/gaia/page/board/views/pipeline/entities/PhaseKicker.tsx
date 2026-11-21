/**
 * The line over a phase the forge level shares, as MonoDesignForge draws it: the phase's dot in its colour, then which phase it is and
 * that every entity shares it.
 */
import { Row }  from 'design-system/Row';
import { Text } from 'design-system/Text';

export interface PhaseKickerProps {
  readonly phase: 'ticket' | 'merge';
  readonly text:  string;
}

export function PhaseKicker({ phase, text }: PhaseKickerProps) {
  return (
    <Row centerY gap="six">
      <span className="board-pipeline-phase-dot" data-phase={phase} aria-hidden="true" />
      <Text typeRole="small" muted>{text}</Text>
    </Row>
  );
}
