/**
 * A0bResume, the resume summary: the setup steps in a vertical stepper, each with its status and its summary, a done step with Open; the
 * current step with its open questions and its pipeline agent; Resume, which reopens the agent and goes to the current step; and Start
 * over, which asks first. A note says when main moved since the research.
 */
import { useState } from 'react';

import type { PipelineSetupFacts }             from '../../../../src/lib/tracker-model/@types/PipelineFacts.ts';
import { Button }                              from '../../../design-system/Button.tsx';
import { ConfirmStrip }                        from '../../../design-system/ConfirmStrip.tsx';
import { Stepper, type StepperStep }           from '../../../design-system/Stepper.tsx';
import { CommandButton }                       from '../../../shell/CommandButton.tsx';
import { HashRouter }                          from '../../../shell/HashRouter.ts';
import { PipelineViewModel }                   from '../PipelineViewModel.ts';
import { ResumeSummaryModel, type ResumeStep } from './ResumeSummaryModel.ts';

export interface ResumeSummaryProps {
  readonly setup: PipelineSetupFacts;
}

function StepDetail({ step }: { readonly step: ResumeStep }) {
  return (
    <>
      {step.recheck ? <span className="bridge-pipeline-resume-recheck">recheck</span> : null}
      {step.summary === null ? null : <span className="bridge-pipeline-resume-summary">{step.summary}</span>}
      {step.chips.length === 0
        ? null
        : (
          <span className="bridge-pipeline-resume-chips">
            {step.chips.map((chip) => <span key={chip.text} className="bridge-pipeline-resume-chip" data-tone={chip.tone}>{chip.text}</span>)}
          </span>
        )}
    </>
  );
}

function stepperStepOf(step: ResumeStep): StepperStep {
  const hasDetail = step.recheck || step.summary !== null || step.chips.length > 0;
  return {
    key:    step.step,
    label:  step.label,
    status: step.status,
    ...(hasDetail ? { detail: <StepDetail step={step} /> } : {}),
    ...(step.openHref === null ? {} : { href: step.openHref, actionLabel: 'Open' }),
  };
}

export function ResumeSummary({ setup }: ResumeSummaryProps) {
  const [confirmingStartOver, setConfirmingStartOver] = useState(false);
  const mainMovedText = ResumeSummaryModel.mainMovedTextOf(setup);
  const { currentStep } = setup.record;
  return (
    <div className="bridge-pipeline-resume">
      <section className="bridge-pipeline-setup-hero">
        <span className="bridge-pipeline-resume-badge">Setup in progress</span>
        <h2 className="bridge-pipeline-setup-heading">Pick up where you left off</h2>
        <p className="bridge-pipeline-setup-lead">{ResumeSummaryModel.leadTextOf(setup)}</p>
      </section>
      <Stepper label="Setup steps" orientation="vertical" steps={ResumeSummaryModel.resumeStepsOf(setup).map(stepperStepOf)} />
      <div className="bridge-pipeline-resume-actions">
        <CommandButton
          label={ResumeSummaryModel.resumeLabelOf(setup)}
          command={ResumeSummaryModel.resumeCommandOf(setup)}
          primary
          attention
          onApplied={() => HashRouter.navigateTo(PipelineViewModel.setupStepRouteOf(currentStep))}
        />
        {confirmingStartOver
          ? (
            <ConfirmStrip
              label="Confirm starting over"
              question="Discard the saved setup?"
              consequence="This cannot be undone."
              tone="danger"
              confirm={<CommandButton label="Start over" command={ResumeSummaryModel.startOverCommandOf(setup)} danger />}
              cancelLabel="Cancel"
              onCancel={() => setConfirmingStartOver(false)}
            />
          )
          : <Button label="Start over" onPress={() => setConfirmingStartOver(true)} />}
      </div>
      {mainMovedText === null ? null : <p className="bridge-pipeline-resume-main-moved">{mainMovedText}</p>}
    </div>
  );
}
