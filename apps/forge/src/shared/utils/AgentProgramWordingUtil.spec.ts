import { expect, test } from 'bun:test';

import { AgentProgramWordingUtil } from './AgentProgramWordingUtil.ts';

test('a native Windows install repair is worded with the adapter\'s own install command', () => {
  expect(AgentProgramWordingUtil.repairClauseOf({ code: 'install-native-windows-program', installCommand: 'example-install' }))
    .toBe('install the native program in PowerShell with `example-install`, and choose that program');
});
