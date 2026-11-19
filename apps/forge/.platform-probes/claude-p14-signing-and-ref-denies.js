// P14: signing and the ref denies under a per-job sandbox, one Bash call per allowance. The record's row granting writes
// to `~/.gnupg` is left out, and no signature is verified: both hung the machine's gpg daemons in the macOS run.
import { writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { observedSession, rootAnchored, sandboxSettingsOf, writeJsonFile } from './support/claude-session.js';
import { gpgconfProgramOption, probe } from './support/probe.js';
import { programPathOf, runProgram } from './support/programs.js';
import { createLinkedRepository, git, scratchFolder } from './support/scratch.js';

const IDENTITY = '-c user.name=Probe -c user.email=probe@example.com';

function attemptsScriptOf({ common, otherAdminFolder, ownAdminFolder }) {
  const attempts = [
    ['unsigned commit', `git ${IDENTITY} -c commit.gpgsign=false commit --allow-empty -m unsigned`],
    ['signed commit', `git ${IDENTITY} -c commit.gpgsign=true commit --allow-empty -m signed`],
    ['signature header', `git cat-file -p HEAD | grep -c gpgsig`],
    ['create branch', 'git branch probe-branch'],
    ['move main', 'git update-ref refs/heads/main HEAD'],
    ['move group-alpha', 'git update-ref refs/heads/group-alpha HEAD'],
    ['move ticket-2', 'git update-ref refs/heads/ticket-2 HEAD'],
    ['append packed-refs', `echo probe >> '${join(common, 'packed-refs')}'`],
    ['write other worktree admin', `echo probe > '${join(otherAdminFolder, 'probe')}'`],
    ['write own worktree admin', `echo probe > '${join(ownAdminFolder, 'probe')}'`],
    ['read gpg private keys', `ls '${join(homedir(), '.gnupg', 'private-keys-v1.d')}'`],
    ['write gnupg', `touch '${join(homedir(), '.gnupg', 'platform-probe')}'`],
  ];
  return attempts.map(([label, command]) => `echo "### ${label}"; ${command}; echo "exit $?"`).join('\n');
}

async function gpgSocketPaths() {
  const gpgconfProgram = gpgconfProgramOption() ?? programPathOf('gpgconf');
  if (gpgconfProgram === null) return null;
  const agentSocket = await runProgram([gpgconfProgram, '--list-dirs', 'agent-socket']);
  const keyboxdSocket = await runProgram([gpgconfProgram, '--list-dirs', 'keyboxd-socket']);
  return [agentSocket.stdout?.trim(), keyboxdSocket.stdout?.trim()].filter(Boolean);
}

await probe({
  unknown: 'claude-p14-signing-and-ref-denies',
  needsClaudeProgram: true,
  observe: async () => {
    const { repository, data, worktree, common } = await createLinkedRepository();
    await git(repository, 'branch', 'group-alpha');
    await git(repository, 'worktree', 'add', join(repository, '.agent-progress-worktrees', 'ticket-2'), '-b', 'ticket-2');
    await git(repository, 'pack-refs', '--all');
    const otherAdminFolder = join(common, 'worktrees', 'ticket-2');
    const ownAdminFolder = join(common, 'worktrees', 'ticket-1');
    const scriptPath = join(scratchFolder(), 'attempts.sh');
    writeFileSync(scriptPath, attemptsScriptOf({ common, otherAdminFolder, ownAdminFolder }));
    const gnupg = join(homedir(), '.gnupg');
    const denyWrite = [
      data,
      join(common, 'packed-refs'),
      join(common, 'refs', 'heads', 'main'),
      join(common, 'refs', 'heads', 'group-alpha'),
      join(common, 'refs', 'heads', 'ticket-2'),
      otherAdminFolder,
      gnupg,
    ];

    async function sessionWithAllowance(denyRead, allowUnixSockets) {
      const settingsPath = writeJsonFile(join(scratchFolder(), 'settings.json'), {
        sandbox: sandboxSettingsOf({
          filesystem: { allowWrite: [worktree, ownAdminFolder, common], denyWrite, denyRead },
          network: allowUnixSockets === null ? {} : { allowUnixSockets },
        }),
        permissions: { deny: denyWrite.map((path) => `Edit(${rootAnchored(path)}/**)`) },
      });
      const refsBefore = (await git(repository, 'for-each-ref')).stdout;
      const session = await observedSession({
        cwd: worktree,
        extraArguments: ['--settings', settingsPath, '--permission-mode', 'auto'],
        prompts: [`Run \`sh '${scriptPath}'\` with the Bash tool, once, and print all its output unchanged.`],
      });
      return { refsBefore, refsAfter: (await git(repository, 'for-each-ref')).stdout, toolResults: session.toolResults, results: session.results };
    }

    const sockets = await gpgSocketPaths();
    return {
      gpgSockets: sockets,
      noSigningAllowance: await sessionWithAllowance([gnupg], null),
      agentAndKeyboxdSockets: sockets === null ? null : await sessionWithAllowance([join(gnupg, 'private-keys-v1.d')], sockets),
    };
  },
});
