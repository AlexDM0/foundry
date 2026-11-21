import type { MonitorInterruptionCause } from 'forge-contracts/MonitorSnapshotDocument';

import type { InterruptionCause } from '../../lib/tracker-model/@types/Job.ts';

/** Every model cause as the contract spells it, so a new cause fails the compiler until it is mapped; presence and the board document read it too. */
export const MONITOR_INTERRUPTION_CAUSE_OF_CAUSE: Readonly<Record<InterruptionCause, MonitorInterruptionCause>> = {
  'talos-lost':            'child-lost',
  'agent-crashed':         'agent-crashed',
  'reboot':                'reboot',
  'answer-delivery':       'answer-delivery',
  'usage-limit':           'usage-limit',
  'handoff-red':           'handoff-red',
  'forced-stop-refused':   'forced-stop-refused',
  'authentication-failed': 'authentication-failed',
  'talos-paused':          'talos-paused',
  'lease-ended':           'lease-ended',
  'network-outage':        'network-outage',
  'forge-stopped':         'forge-stopped',
  'forge-crashed':         'forge-crashed',
};
