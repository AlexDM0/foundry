/**
 * The steps of a process in order, in a row or a column: each a circle (its number, or a check once done), its label and an optional
 * detail. The current step is `aria-current="step"`. A done or recheck step with an `href` links back to itself: through its label, or,
 * with an `actionLabel`, through an action at the row's end.
 */
import { useId, type ReactNode } from 'react';

export type StepperStatus = 'done' | 'current' | 'upcoming' | 'recheck';

export interface StepperStep {
  readonly key:          string;
  readonly label:        string;
  readonly status:       StepperStatus;
  readonly detail?:      ReactNode;
  /** Where the step reopens; used only on a done or recheck step. */
  readonly href?:        string;
  /** The words of the reopening link at the row's end, such as "Open"; without it the label is the link. */
  readonly actionLabel?: string;
}

export interface StepperProps {
  readonly label:       string;
  readonly orientation: 'horizontal' | 'vertical';
  readonly steps:       readonly StepperStep[];
}

function reopens(step: StepperStep): step is StepperStep & { readonly href: string } {
  return step.href !== undefined && (step.status === 'done' || step.status === 'recheck');
}

function CheckGlyph() {
  return (
    <svg className="bridge-stepper-check" viewBox="0 0 12 12" aria-hidden="true">
      <path d="M2 6.5L5 9L10 3" />
    </svg>
  );
}

function StepperRow({ step, number, isLast }: { readonly step: StepperStep; readonly number: number; readonly isLast: boolean }) {
  const labelId = useId();
  const linksThroughAction = reopens(step) && step.actionLabel !== undefined;
  const linksThroughLabel = reopens(step) && step.actionLabel === undefined;
  return (
    <li className="bridge-stepper-step" data-status={step.status} aria-current={step.status === 'current' ? 'step' : undefined}>
      <span className="bridge-stepper-circle" aria-hidden="true">{step.status === 'done' ? <CheckGlyph /> : number}</span>
      <span className="bridge-stepper-body">
        {linksThroughLabel
          ? <a className="bridge-stepper-label" id={labelId} href={step.href}>{step.label}</a>
          : <span className="bridge-stepper-label" id={labelId}>{step.label}</span>}
        {step.detail === undefined ? null : <span className="bridge-stepper-detail">{step.detail}</span>}
      </span>
      {linksThroughAction
        ? <a className="bridge-stepper-action" href={step.href} aria-describedby={labelId}>{step.actionLabel}</a>
        : null}
      {isLast ? null : <span className="bridge-stepper-line" data-status={step.status} aria-hidden="true" />}
    </li>
  );
}

export function Stepper({ label, orientation, steps }: StepperProps) {
  return (
    <ol className="bridge-stepper" aria-label={label} data-orientation={orientation}>
      {steps.map((step, index) => <StepperRow key={step.key} step={step} number={index + 1} isLast={index === steps.length - 1} />)}
    </ol>
  );
}
