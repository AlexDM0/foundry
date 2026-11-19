/**
 * Why a monitor job stands interrupted, as the wire spells it: `child-lost` is a supervising process gone while its job ran with no result.
 * `lease-ended`, `network-outage`, `forge-stopped` (the forge was stopped on purpose) and `forge-crashed` (the forge crashed) wait for the
 * user's resume; the list only widens.
 */
export const MONITOR_INTERRUPTION_CAUSES = [
  'child-lost',
  'agent-crashed',
  'reboot',
  'answer-delivery',
  'usage-limit',
  'handoff-red',
  'forced-stop-refused',
  'authentication-failed',
  'talos-paused',
  'lease-ended',
  'network-outage',
  'forge-stopped',
  'forge-crashed',
] as const;
