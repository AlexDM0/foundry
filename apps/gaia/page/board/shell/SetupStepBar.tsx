/**
 * The setup header's step bar, in the tab bar's place while the board has no readable pipeline: the setup steps in a compact stepper,
 * five in single mode and six with the entities step in monorepo mode, and at the right end which step this is.
 */
import { Stepper, type StepperStep } from 'design-system/Stepper';
import { Text }                      from 'design-system/Text';

export interface SetupStepBarProps {
  readonly steps: readonly StepperStep[];
}

/** "Step 2 of 5 · saved as you go", "Step 3 of 6" in monorepo mode,, or only that the steps are saved while no step is current. */
function stepPositionTextOf(steps: readonly StepperStep[]): string {
  const currentIndex = steps.findIndex((step) => step.status === 'current');
  return currentIndex < 0 ? 'Saved as you go' : `Step ${currentIndex + 1} of ${steps.length} · saved as you go`;
}

export function SetupStepBar({ steps }: SetupStepBarProps) {
  return (
    <div className="board-setup-step-bar">
      <Stepper label="Setup steps" orientation="horizontal" compact steps={steps} />
      <Text typeRole="tab" subtle>{stepPositionTextOf(steps)}</Text>
    </div>
  );
}
