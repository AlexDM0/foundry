/**
 * One contract for every Autostart adapter, run on this machine over fakes: macOS and Linux write into a scratch home, Linux under a
 * systemctl that answers yes, and Windows into a fake registry that reg.exe's `add` and `query` read and write. What matters is that an
 * item reads back the repository it starts, under its own label only, so setup's refusal of a label serving another repository holds on
 * every OS. Paths with spaces prove the quoting reads back.
 */
import { mkdirSync }        from 'node:fs';
import { join, win32 }      from 'node:path';
import { afterAll, expect } from 'bun:test';

import { runPortContract, type PortSubject }                       from '../../src/testing/PortContract.ts';
import { createCanonicalScratchDirectory, removeScratchDirectory } from '../../src/testing/ScratchWorkspace.ts';
import { FakeAutostartHost }                                       from '../testing/FakeAutostartHost.ts';
import { type Autostart, type LoginItem }                          from './Autostart.ts';
import { autostartFor }                                            from './AutostartFor.ts';

interface AutostartSubject {
  readonly autostart: Autostart;
  readonly itemFor:   (label: string, repositoryName: string) => LoginItem;
}

const scratchDirectories: string[] = [];

afterAll(() => {
  for (const scratchDirectory of scratchDirectories) removeScratchDirectory(scratchDirectory);
});

function posixSubject(platform: 'darwin' | 'linux'): AutostartSubject {
  const scratchDirectory = createCanonicalScratchDirectory(`autostart-${platform}`);
  scratchDirectories.push(scratchDirectory);
  const homeDirectory = join(scratchDirectory, 'home of Alex Example');
  mkdirSync(homeDirectory);
  const autostart = autostartFor(platform, FakeAutostartHost.posixPrimitives(homeDirectory).primitives);
  if (autostart === null) throw new Error(`no adapter for ${platform}`);
  return {
    autostart,
    itemFor: (label, repositoryName) => FakeAutostartHost.posixItem(label, join(scratchDirectory, repositoryName)),
  };
}

function windowsSubject(): AutostartSubject {
  const autostart = autostartFor('win32', FakeAutostartHost.windowsPrimitives().primitives);
  if (autostart === null) throw new Error('no adapter for win32');
  return {
    autostart,
    itemFor: (label, repositoryName) => FakeAutostartHost.windowsItem(label, win32.join('C:\\Users\\Alex Example\\code', repositoryName)),
  };
}

const SUBJECTS: readonly PortSubject<AutostartSubject>[] = [
  { name: 'DarwinAutostart over a scratch home', build: () => posixSubject('darwin') },
  { name: 'LinuxAutostart over a scratch home and a systemctl that answers', build: () => posixSubject('linux') },
  { name: 'WindowsAutostart over a fake registry', build: windowsSubject },
];

runPortContract<AutostartSubject>('Autostart', SUBJECTS, [
  {
    claim: 'a host the adapter serves has no reason the item would not run',
    check: ({ autostart }) => {
      expect(autostart.unavailableReason()).toBeNull();
    },
  },
  {
    claim: 'no repository reads back under a label nothing was written under',
    check: ({ autostart }) => {
      expect(autostart.registeredRepositoryOf('com.example-agency.overseer')).toBeNull();
    },
  },
  {
    claim: 'a written item reads back its repository under its label, and its command starts the Overseer',
    check: ({ autostart, itemFor }) => {
      const item = itemFor('com.example-agency.overseer', 'example storefront');
      expect(autostart.write(item)).toEqual({ verdict: 'written' });
      expect(autostart.registeredRepositoryOf(item.label)).toBe(item.repository);
      expect(autostart.commandOf(item)).toContain('oversee');
      expect(autostart.locationOf(item.label)).toContain(item.label);
    },
  },
  {
    claim: 'an item under a second label leaves the first one reading back its own repository',
    check: ({ autostart, itemFor }) => {
      const first = itemFor('com.example-agency.overseer', 'example-storefront');
      const second = itemFor('com.example-agency.second', 'example-warehouse');
      autostart.write(first);
      autostart.write(second);
      expect(autostart.registeredRepositoryOf(first.label)).toBe(first.repository);
      expect(autostart.registeredRepositoryOf(second.label)).toBe(second.repository);
    },
  },
  {
    claim: 'a removed item reads back no repository, and a second removal finds it absent',
    check: ({ autostart, itemFor }) => {
      const item = itemFor('com.example-agency.overseer', 'example-storefront');
      autostart.write(item);
      expect(autostart.remove(item.label)).toEqual({ verdict: 'removed' });
      expect(autostart.registeredRepositoryOf(item.label)).toBeNull();
      expect(autostart.remove(item.label)).toEqual({ verdict: 'absent' });
    },
  },
  {
    claim: 'a rewrite of the same label reads back the newer repository',
    check: ({ autostart, itemFor }) => {
      autostart.write(itemFor('com.example-agency.overseer', 'example-storefront'));
      const rewritten = itemFor('com.example-agency.overseer', 'example-warehouse');
      autostart.write(rewritten);
      expect(autostart.registeredRepositoryOf(rewritten.label)).toBe(rewritten.repository);
    },
  },
]);
