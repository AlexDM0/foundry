import { join } from 'node:path';

import { type Autostart, type AutostartPrimitives, type LoginItem } from './Autostart.ts';

const SYSTEMCTL_PROGRAM = 'systemctl';

const WORKING_DIRECTORY_PATTERN = /^WorkingDirectory=(.*)$/m;

/** systemd expands `%` specifiers in every value here and `$` variables in a command line, so both are doubled to stay literal. */
function specifierEscaped(text: string): string {
  return text.replaceAll('%', '%%');
}

function quotedUnitArgumentOf(text: string): string {
  const escaped = specifierEscaped(text).replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('$', () => '$$');
  return `"${escaped}"`;
}

/** Foreground, so systemd watches Hephaestus itself: a detached `start` would exit at once and leave a unit with nothing in it. */
function commandOf(item: LoginItem): readonly string[] {
  return [item.bunProgram, ...item.isolatingArguments, item.entryPoint, 'start', '--foreground', '--started-by', 'login-item'];
}

/** `KillMode=process` stops only Hephaestus with the unit, so the Talos it started outlives a stop or restart, as they must. */
function unitTextOf(item: LoginItem): string {
  return [
    '[Unit]',
    `Description=Hephaestus of ${specifierEscaped(item.repository)}`,
    '',
    '[Service]',
    'Type=simple',
    `WorkingDirectory=${specifierEscaped(item.repository)}`,
    `Environment=${quotedUnitArgumentOf(`PATH=${item.searchPath}`)}`,
    `ExecStart=${commandOf(item).map(quotedUnitArgumentOf).join(' ')}`,
    'KillMode=process',
    'Restart=on-failure',
    '',
    '[Install]',
    'WantedBy=default.target',
    '',
  ].join('\n');
}

/** Linux: a systemd user unit, enabled for the user's service manager, running Hephaestus in the foreground. */
export function linuxAutostartOver(primitives: AutostartPrimitives): Autostart {
  const unitFileNameOf = (label: string): string => `${label}.service`;
  const locationOf = (label: string): string => join(primitives.homeDirectory, '.config', 'systemd', 'user', unitFileNameOf(label));
  const systemctl = (): string | null => primitives.programOnSearchPath(SYSTEMCTL_PROGRAM);
  return {
    mechanism:         'systemd user unit',
    locationOf,
    unavailableReason: () => {
      const program = systemctl();
      if (program === null) return `no ${SYSTEMCTL_PROGRAM} is on PATH, so this host has no systemd to start a login item`;
      const probe = primitives.run([program, '--user', 'show-environment'], primitives.homeDirectory);
      return probe.exitCode === 0 ? null : `${SYSTEMCTL_PROGRAM} --user does not reach a user service manager: ${probe.output.trim()}`;
    },
    registeredRepositoryOf: (label) => {
      const stored = primitives.readText(locationOf(label));
      const workingDirectory = stored === null ? undefined : WORKING_DIRECTORY_PATTERN.exec(stored)?.[1];
      return workingDirectory === undefined ? null : workingDirectory.replaceAll('%%', '%');
    },
    commandOf,
    write: (item) => {
      const program = systemctl() ?? SYSTEMCTL_PROGRAM;
      primitives.writeText(locationOf(item.label), unitTextOf(item));
      for (const step of [['daemon-reload'], ['enable', unitFileNameOf(item.label)]]) {
        const finished = primitives.run([program, '--user', ...step], primitives.homeDirectory);
        if (finished.exitCode !== 0) {
          return { verdict: 'refused', reason: `${SYSTEMCTL_PROGRAM} --user ${step.join(' ')} failed, so the unit will not start at login: ${finished.output.trim()}` };
        }
      }
      return { verdict: 'written' };
    },
    remove: (label) => {
      if (primitives.readText(locationOf(label)) === null) return { verdict: 'absent' };
      const program = systemctl() ?? SYSTEMCTL_PROGRAM;
      const disabled = primitives.run([program, '--user', 'disable', unitFileNameOf(label)], primitives.homeDirectory);
      if (disabled.exitCode !== 0) return { verdict: 'refused', reason: `${SYSTEMCTL_PROGRAM} --user disable failed: ${disabled.output.trim()}` };
      primitives.removeFile(locationOf(label));
      primitives.run([program, '--user', 'daemon-reload'], primitives.homeDirectory);
      return { verdict: 'removed' };
    },
    adviceAfterWriting: (item) => [
      `To start it now as well: ${SYSTEMCTL_PROGRAM} --user start ${unitFileNameOf(item.label)}`,
      'To start it at boot without a login session: loginctl enable-linger "$USER"',
    ],
  };
}
