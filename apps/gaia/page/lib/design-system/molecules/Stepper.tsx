/**
 * The steps of a process in order, in a row or a column: each a circle with its number or, once done, a check, its label and an optional detail.
 * A done or recheck step with an `href` links back through its label or an `actionLabel` action at the row's end. A compact stepper draws no
 * circles: a check for done, a dot for current, and the label alone for the rest.
 */
import { useId, type ReactNode } from 'react';

import { Icon } from '../atoms/Icon.tsx';

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
  /** No numbered circles: a check before a done step and a dot before the current one, for a one-line bar. */
  readonly compact?:    boolean;
}

function reopens(step: StepperStep): step is StepperStep & { readonly href: string } {
  return step.href !== undefined && (step.status === 'done' || step.status === 'recheck');
}

function CheckGlyph() {
  return <span className="design-system-stepper-check"><Icon name="check" label={null} /></span>;
}

interface StepperRowProps {
  readonly step:      StepperStep;
  readonly number:    number;
  readonly isLast:    boolean;
  readonly isCompact: boolean;
}

/** The circle before a step: its number or a check, or, compact, a check, a dot or nothing. */
function StepMarker({ step, number, isCompact }: Omit<StepperRowProps, 'isLast'>) {
  if (step.status === 'done') return <span className="design-system-stepper-circle" aria-hidden="true"><CheckGlyph /></span>;
  if (!isCompact) return <span className="design-system-stepper-circle" aria-hidden="true">{number}</span>;
  return step.status === 'current' ? <span className="design-system-stepper-circle" aria-hidden="true" /> : null;
}

function StepperRow({
  step, number, isLast, isCompact
}: StepperRowProps) {
  const labelId = useId();
  const linksThroughAction = reopens(step) && step.actionLabel !== undefined;
  const linksThroughLabel = reopens(step) && step.actionLabel === undefined;
  return (
    <li className="design-system-stepper-step" data-status={step.status} aria-current={step.status === 'current' ? 'step' : undefined}>
      <StepMarker step={step} number={number} isCompact={isCompact} />
      <span className="design-system-stepper-body">
        {linksThroughLabel
          ? <a className="design-system-stepper-label" id={labelId} href={step.href}>{step.label}</a>
          : <span className="design-system-stepper-label" id={labelId}>{step.label}</span>}
        {step.detail === undefined ? null : <span className="design-system-stepper-detail">{step.detail}</span>}
      </span>
      {linksThroughAction
        ? <a className="design-system-stepper-action" href={step.href} aria-describedby={labelId}>{step.actionLabel}</a>
        : null}
      {isLast ? null : <span className="design-system-stepper-line" data-status={step.status} aria-hidden="true" />}
    </li>
  );
}

export function Stepper({
  label, orientation, steps, compact = false
}: StepperProps) {
  return (
    <ol className="design-system-stepper" aria-label={label} data-orientation={orientation} data-compact={compact ? '' : undefined}>
      {steps.map((step, index) => (
        <StepperRow key={step.key} step={step} number={index + 1} isLast={index === steps.length - 1} isCompact={compact} />
      ))}
    </ol>
  );
}
