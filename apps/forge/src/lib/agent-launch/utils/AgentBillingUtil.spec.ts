/**
 * The billing of a vendor as its adapter states it. What matters: only the adapter's own vendor has ways to bill; an absent billing is
 * the default way; a way that needs a key launches only once its variable is set; and a way the vendor does not bill never launches.
 */
import { describe, expect, test } from 'bun:test';

import type { AgentBillingOption } from '../AgentAdapter.ts';
import { AgentBillingUtil }        from './AgentBillingUtil.ts';

const OPTIONS: readonly AgentBillingOption[] = [
  { mode: 'subscription', keyVariableName: null, capsEachLaunch: false },
  { mode: 'api', keyVariableName: 'EXAMPLE_AGENT_KEY', capsEachLaunch: true },
];

const LOGIN_ONLY: readonly AgentBillingOption[] = [{ mode: 'subscription', keyVariableName: null, capsEachLaunch: false }];

const ADAPTER = { vendor: 'example-agent', billingOptions: OPTIONS };

describe('the ways a vendor bills', () => {
  test('are its adapter\'s options in order, default first', () => {
    expect(AgentBillingUtil.offeredModesOf(ADAPTER, 'example-agent')).toEqual(['subscription', 'api']);
  });

  test('are none for a vendor whose adapter this is not', () => {
    expect(AgentBillingUtil.offeredModesOf(ADAPTER, 'another-agent')).toEqual([]);
  });
});

describe('whether a launch can start under a billing', () => {
  test('an absent billing is the default way, which needs no key here', () => {
    expect(AgentBillingUtil.launchReadinessOf(OPTIONS, undefined, () => false)).toEqual({ verdict: 'ready' });
  });

  test('a way with a key waits for its variable, and starts once it is set', () => {
    expect(AgentBillingUtil.launchReadinessOf(OPTIONS, { mode: 'api' }, () => false)).toEqual({ verdict: 'key-missing', keyVariableName: 'EXAMPLE_AGENT_KEY' });
    expect(AgentBillingUtil.launchReadinessOf(OPTIONS, { mode: 'api' }, (name) => name === 'EXAMPLE_AGENT_KEY')).toEqual({ verdict: 'ready' });
  });

  test('a way the vendor does not bill never launches, whatever is set', () => {
    expect(AgentBillingUtil.launchReadinessOf(LOGIN_ONLY, { mode: 'api', maxBudgetUsd: 5 }, () => true)).toEqual({ verdict: 'not-offered', mode: 'api' });
  });

  test('a vendor with no way to bill launches nothing, its default included', () => {
    expect(AgentBillingUtil.launchReadinessOf([], undefined, () => true)).toEqual({ verdict: 'not-offered', mode: 'subscription' });
  });
});

describe('the key variable of a way', () => {
  test('is the option\'s own, and none for the login or a way the vendor does not bill', () => {
    expect(AgentBillingUtil.keyVariableNameOf(OPTIONS, 'api')).toBe('EXAMPLE_AGENT_KEY');
    expect(AgentBillingUtil.keyVariableNameOf(OPTIONS, 'subscription')).toBeNull();
    expect(AgentBillingUtil.keyVariableNameOf(LOGIN_ONLY, 'api')).toBeNull();
  });
});
