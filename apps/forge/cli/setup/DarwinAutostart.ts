import { join } from 'node:path';

import { type Autostart, type AutostartPrimitives, type LoginItem } from './Autostart.ts';

const XML_ENTITIES: readonly (readonly [string, string])[] = [['&', '&amp;'], ['<', '&lt;'], ['>', '&gt;']];

function xmlEscaped(text: string): string {
  return XML_ENTITIES.reduce((escaped, [character, entity]) => escaped.replaceAll(character, entity), text);
}

function xmlUnescaped(text: string): string {
  return [...XML_ENTITIES].reverse().reduce((unescaped, [character, entity]) => unescaped.replaceAll(entity, character), text);
}

const WORKING_DIRECTORY_PATTERN = /<key>WorkingDirectory<\/key>\s*<string>([^<]*)<\/string>/;

function commandOf(item: LoginItem): readonly string[] {
  return [item.bunProgram, ...item.isolatingArguments, item.entryPoint, 'oversee', '--detach'];
}

function propertyListOf(item: LoginItem): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    '<dict>',
    '  <key>Label</key>',
    `  <string>${xmlEscaped(item.label)}</string>`,
    '  <key>ProgramArguments</key>',
    '  <array>',
    ...commandOf(item).map((argument) => `    <string>${xmlEscaped(argument)}</string>`),
    '  </array>',
    '  <key>WorkingDirectory</key>',
    `  <string>${xmlEscaped(item.repository)}</string>`,
    '  <key>EnvironmentVariables</key>',
    '  <dict>',
    '    <key>PATH</key>',
    `    <string>${xmlEscaped(item.searchPath)}</string>`,
    '  </dict>',
    '  <key>RunAtLoad</key>',
    '  <true/>',
    '</dict>',
    '</plist>',
    '',
  ].join('\n');
}

/** macOS: a LaunchAgent that launchd runs once at login, `oversee --detach` in the repository. */
export function darwinAutostartOver(primitives: AutostartPrimitives): Autostart {
  const locationOf = (label: string): string => join(primitives.homeDirectory, 'Library', 'LaunchAgents', `${label}.plist`);
  return {
    mechanism:              'LaunchAgent',
    locationOf,
    unavailableReason:      () => null,
    registeredRepositoryOf: (label) => {
      const stored = primitives.readText(locationOf(label));
      const workingDirectory = stored === null ? undefined : WORKING_DIRECTORY_PATTERN.exec(stored)?.[1];
      return workingDirectory === undefined ? null : xmlUnescaped(workingDirectory);
    },
    commandOf,
    write: (item) => {
      primitives.writeText(locationOf(item.label), propertyListOf(item));
      return { verdict: 'written' };
    },
    remove: (label) => {
      if (primitives.readText(locationOf(label)) === null) return { verdict: 'absent' };
      primitives.removeFile(locationOf(label));
      return { verdict: 'removed' };
    },
    adviceAfterWriting: (item) => [`To start it now as well: launchctl bootstrap gui/$(id -u) "${locationOf(item.label)}"`],
  };
}
