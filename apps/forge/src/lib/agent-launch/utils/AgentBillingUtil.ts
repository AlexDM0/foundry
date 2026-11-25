/**
 * A vendor's billing read through its adapter: the ways it bills, and whether a launch under a billing can start now. An absent billing
 * is the vendor's default, its first way.
 */
import type { AgentAdapter, AgentBillingOption } from '../AgentAdapter.ts';
import type { AgentBilling }                     from '../AgentLaunchRequest.ts';

/** `not-offered`: the vendor does not bill that way; `key-missing`: its key is not in the variable the way names. */
export type LaunchBillingReadiness =
  | { readonly verdict: 'ready' }
  | { readonly verdict: 'key-missing'; readonly keyVariableName: string }
  | { readonly verdict: 'not-offered'; readonly mode: AgentBilling['mode'] };

/** The ways `vendor` bills, its default first; none when `adapter` is another vendor's, since only an adapter knows its vendor's billing. */
function offeredModesOf(adapter: Pick<AgentAdapter, 'vendor' | 'billingOptions'>, vendor: string): AgentBilling['mode'][] {
  return adapter.vendor === vendor ? adapter.billingOptions.map((option) => option.mode) : [];
}

function optionOf(options: readonly AgentBillingOption[], billing: AgentBilling | undefined): AgentBillingOption | undefined {
  return billing === undefined ? options[0] : options.find((option) => option.mode === billing.mode);
}

/** Fails closed: a billing the vendor does not bill by never launches, nor does one whose key is not set. */
function launchReadinessOf(
  options: readonly AgentBillingOption[],
  billing: AgentBilling | undefined,
  variableIsSet: (variableName: string) => boolean,
): LaunchBillingReadiness {
  const option = optionOf(options, billing);
  if (option === undefined) return { verdict: 'not-offered', mode: billing?.mode ?? 'subscription' };
  if (option.keyVariableName !== null && !variableIsSet(option.keyVariableName)) return { verdict: 'key-missing', keyVariableName: option.keyVariableName };
  return { verdict: 'ready' };
}

/** The variable the key of `mode` is read from; `null` when the vendor bills that way by its login, or not at all. */
function keyVariableNameOf(options: readonly AgentBillingOption[], mode: AgentBilling['mode']): string | null {
  return options.find((option) => option.mode === mode)?.keyVariableName ?? null;
}

export const AgentBillingUtil = Object.freeze({ offeredModesOf, launchReadinessOf, keyVariableNameOf });
