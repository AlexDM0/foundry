import type { AgentAdapter } from '../agent-launch/AgentAdapter.ts';

const WINDOWS_NATIVE_INSTALL_COMMAND = 'irm https://claude.ai/install.ps1 | iex';

/** A batch target is the npm shim of `claude` on Windows, which only the native program replaces; no other refusal has a repair. */
export const claudeProgramRepairOf: AgentAdapter['programRepairOf'] = (cause) => (cause === 'batch-target'
  ? `install the native program in PowerShell with \`${WINDOWS_NATIVE_INSTALL_COMMAND}\`, and put its folder first on PATH`
  : null);
