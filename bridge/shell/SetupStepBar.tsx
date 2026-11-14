/**
 * The setup header's step bar, in the tab bar's place while the board has no readable pipeline: the five setup steps in a compact
 * stepper, and at the right end which step this is.
 */
import { Stepper, type StepperStep } from 'design-system/Stepper';
import { Text }                      from 'design-system/Text';

export interface SetupStepBarProps {
  readonly steps: readonly StepperStep[];
}

/** "Step 2 of 5 · saved as you go", or only that the steps are saved while no step is current. */
function stepPositionTextOf(steps: readonly StepperStep[]): string {
  const currentIndex = steps.findIndex((step) => step.status === 'current');
  return currentIndex < 0 ? 'Saved as you go' : `Step ${currentIndex + 1} of ${steps.length} · saved as you go`;
}

export function SetupStepBar({ steps }: SetupStepBarProps) {
  return (
    <div className="bridge-setup-step-bar">
      <Stepper label="Setup steps" orientation="horizontal" compact steps={steps} />
      <Text typeRole="tab" subtle>{stepPositionTextOf(steps)}</Text>
    </div>
  );
}
