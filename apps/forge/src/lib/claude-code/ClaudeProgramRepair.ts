import type { AgentAdapter, AgentProgramRepair } from '../agent-launch/AgentAdapter.ts';

const WINDOWS_NATIVE_INSTALL_COMMAND = 'irm https://claude.ai/install.ps1 | iex';

/** A batch target is the npm shim of `claude` on Windows, which only the native program replaces; no other refusal has a repair. */
export const claudeProgramRepairOf: AgentAdapter['programRepairOf'] = (cause): AgentProgramRepair | null => (cause === 'batch-target'
  ? { code: 'install-native-windows-program', installCommand: WINDOWS_NATIVE_INSTALL_COMMAND }
  : null);
