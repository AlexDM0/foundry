/**
 * The setup's step bar, which the page's head over the board shows beside the forge's name while the board has no readable pipeline: the
 * setup steps in a compact stepper, six in single mode and seven with the entities step in monorepo mode, a done or recheck step linking
 * back to its route. Which step this is, and that it is saved, the step's own page says.
 */
import { Stepper, type StepperStep } from '../../lib/design-system/DesignSystemInterface.ts';

import { useBoardHrefOf }     from './BoardRouteLinks.ts';
import type { BoardRoute }    from './BoardRouter.ts';
import type { SetupStepView } from './HeaderModel.ts';

export interface SetupStepBarProps {
  readonly steps: readonly SetupStepView[];
}

/** A step that reopens links to its route under the mounted board. */
function stepperStepOf(step: SetupStepView, hrefOf: (route: BoardRoute) => string): StepperStep {
  const { reopensAt, ...stepFields } = step;
  return reopensAt === null ? stepFields : { ...stepFields, href: hrefOf(reopensAt) };
}

export function SetupStepBar({ steps }: SetupStepBarProps) {
  const hrefOf = useBoardHrefOf();
  return (
    <div className="board-setup-step-bar">
      <Stepper label="Setup steps" orientation="horizontal" compact steps={steps.map((step) => stepperStepOf(step, hrefOf))} />
    </div>
  );
}
