/**
 * A0bResume, the resume summary, as FlowResume draws it: a centred column of the page's title row, the setup steps in a vertical stepper,
 * each with its status and its summary, a done step with Open, the current step with its open questions and its pipeline agent, and the
 * note when main moved since the research; the footer counts the done steps and offers Start over, which asks first in the footer, and
 * Resume, which reopens the agent and goes to the current step.
 */
import { useState }                        from 'react';
import type { BoardPipelineSetupDocument } from '../../../../@types/board/BoardPipelineDocuments.ts';
import {
  ActionBar,
  Button,
  ConfirmStrip,
  Row,
  Stepper,
  type StepperStep,
  Tag,
  Text,
  View
} from '../../../../lib/design-system/DesignSystemInterface.ts';
import { useBoardHrefOf, useBoardNavigation }  from '../../../shell/BoardRouteLinks.ts';
import type { BoardRoute }                     from '../../../shell/BoardRouter.ts';
import { CommandButton }                       from '../../../shell/CommandButton.tsx';
import { ViewTitle }                           from '../../ViewTitle.tsx';
import { PipelineViewModel }                   from '../PipelineViewModel.ts';
import { ResumeSummaryModel, type ResumeStep } from './ResumeSummaryModel.ts';

export interface ResumeSummaryProps {
  readonly setup: BoardPipelineSetupDocument;
}

function StepDetail({ step }: { readonly step: ResumeStep }) {
  return (
    <>
      {step.recheck ? <span className="board-pipeline-resume-recheck">recheck</span> : null}
      {step.summary === null ? null : <Text muted>{step.summary}</Text>}
      {step.chips.length === 0
        ? null
        : (
          <Row wrap gap="six" paddingTop="two">
            {step.chips.map((chip) => <Tag key={chip.text} text={chip.text} tone={chip.tone === 'question' ? 'warn' : 'neutral'} />)}
          </Row>
        )}
    </>
  );
}

function stepperStepOf(step: ResumeStep, hrefOf: (route: BoardRoute) => string): StepperStep {
  const hasDetail = step.recheck || step.summary !== null || step.chips.length > 0;
  return {
    key:    step.step,
    label:  step.label,
    status: step.status,
    ...(hasDetail ? { detail: <StepDetail step={step} /> } : {}),
    ...(step.openRoute === null ? {} : { href: hrefOf(step.openRoute), actionLabel: 'Open' }),
  };
}

export function ResumeSummary({ setup }: ResumeSummaryProps) {
  const navigateTo = useBoardNavigation();
  const hrefOf = useBoardHrefOf();
  const [confirmingStartOver, setConfirmingStartOver] = useState(false);
  const mainMovedText = ResumeSummaryModel.mainMovedTextOf(setup);
  const { currentStep } = setup.record;
  return (
    <div className="board-pipeline-resume">
      <div className="board-pipeline-resume-column">
        <View gap="two">
          <Row paddingBottom="six">
            <Tag text="Setup in progress" tone="neutral" />
          </Row>
          <ViewTitle title="Pick up where you left off" lead={ResumeSummaryModel.leadTextOf(setup)} />
        </View>
        <div className="board-pipeline-resume-steps">
          <Stepper label="Setup steps" orientation="vertical" steps={ResumeSummaryModel.resumeStepsOf(setup).map((step) => stepperStepOf(step, hrefOf))} />
        </div>
        {mainMovedText === null ? null : <Text muted element="p">{mainMovedText}</Text>}
      </div>
      <div className="board-pipeline-resume-footer">
        {confirmingStartOver
          ? (
            <ActionBar
              label="Resume setup actions"
              start={(
                <ConfirmStrip
                  label="Confirm starting over"
                  question="Discard the saved setup?"
                  consequence="The research, the constitution and the proposal are deleted. This cannot be undone."
                  tone="danger"
                  confirm={<CommandButton label="Start over" command={ResumeSummaryModel.startOverCommandOf(setup)} danger />}
                  cancelLabel="Keep the setup"
                  onCancel={() => setConfirmingStartOver(false)}
                />
              )}
              end={null}
            />
          )
          : (
            <ActionBar
              label="Resume setup actions"
              start={(
                <>
                  <Tag text="Saved" tone="neutral" />
                  <Text bold>{ResumeSummaryModel.doneStepsTextOf(setup)}</Text>
                  <Text muted>Nothing is stored in the pipeline until you apply.</Text>
                </>
              )}
              end={(
                <>
                  <Button label="Start over" onPress={() => setConfirmingStartOver(true)} />
                  <CommandButton
                    label={ResumeSummaryModel.resumeLabelOf(setup)}
                    command={ResumeSummaryModel.resumeCommandOf(setup)}
                    primary
                    attention
                    onApplied={() => navigateTo(PipelineViewModel.setupStepRouteOf(currentStep))}
                  />
                </>
              )}
            />
          )}
      </div>
    </div>
  );
}
