/** How a command line names a billing: `subscription`, or `api` with an optional cap per launch. */
import type { PipelineBilling } from '../src/lib/tracker-model/@types/Pipeline.ts';
import { refuseUsage }          from './RecordedIncidentMove.ts';
import type { ArgumentParser }  from './arguments/ArgumentParser.ts';

/** `subscription`, or `api` with an optional cap; a cap that is no positive number is the Board's to refuse, with its reason. */
export function billingFrom(commandArguments: ArgumentParser, mode: string | undefined, usage: string): PipelineBilling {
  const cap = commandArguments.option('max-budget-usd');
  if (mode === 'subscription') {
    if (cap !== undefined) refuseUsage('--max-budget-usd goes only with api billing.', usage);
    return { mode };
  }
  if (mode !== 'api') refuseUsage('Name the billing: subscription or api.', usage);
  if (cap === undefined) return { mode };
  const maxBudgetUsd = Number(cap);
  if (cap.trim() === '' || !Number.isFinite(maxBudgetUsd)) refuseUsage(`"${cap}" is not a number of dollars.`, usage);
  return { mode, maxBudgetUsd };
}
