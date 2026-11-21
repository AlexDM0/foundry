/**
 * Renders a view under enabled controls whose command client records every command and answers with the outcomes a spec queues, then
 * `applied`, and whose picture client records every upload and answers with the verdicts a spec queues, then `uploaded`, each client
 * holding its answers while a spec holds them; and a transcript follower a spec feeds by hand. For the views' DOM specs.
 */
import { act, render, type RenderResult }   from '@testing-library/react';
import { createElement, type ReactElement } from 'react';

import { PAGE_CONTRACT_VERSIONS }                  from '../../../src/shared/constants/PageContractVersions.ts';
import type { BoardCommandDocument }               from '../../@types/board/BoardCommandDocument.ts';
import type { BoardTranscriptEntryDocument }       from '../../@types/board/ConversationDocument.ts';
import type { BoardCommandClient, CommandOutcome } from '../api/BoardCommandClient.ts';
import type { PictureUpload, PictureUploadClient } from '../api/PictureUploadClient.ts';
import type { TranscriptStreamHandlers }           from '../api/TranscriptStreamClient.ts';
import { ControlSurroundingsContext }              from '../shell/ControlAvailability.ts';

/** The version every command the board sends carries, for a spec to spread into the commands it expects sent. */
export const SENT_COMMAND_VERSION = { boardCommandVersion: PAGE_CONTRACT_VERSIONS.gaiaBoardCommand } as const;

export interface FakeControls {
  readonly sent:                 BoardCommandDocument[];
  readonly answerNextWith:       (outcome: CommandOutcome) => void;
  /** Keeps every command from now on unanswered until `releaseCommands`, as while it is on its way. */
  readonly holdCommands:         () => void;
  readonly releaseCommands:      () => Promise<void>;
  /** Every picture posted, in order. */
  readonly uploaded:             Blob[];
  readonly answerNextUploadWith: (upload: PictureUpload) => void;
  /** Keeps every upload from now on unanswered until `releaseUploads`. */
  readonly holdUploads:          () => void;
  readonly releaseUploads:       () => Promise<void>;
  readonly render:               (element: ReactElement) => RenderResult;
}

export function fakeControls(): FakeControls {
  const sent: BoardCommandDocument[] = [];
  const queuedOutcomes: CommandOutcome[] = [];
  let heldCommandAnswers: (() => void)[] | null = null;
  const commandClient: BoardCommandClient = {
    send: (command) => {
      sent.push(command);
      const outcome = queuedOutcomes.shift() ?? { verdict: 'applied', outcome: 'done', result: { startedJobId: null } };
      if (heldCommandAnswers === null) return Promise.resolve(outcome);
      const held = heldCommandAnswers;
      return new Promise((resolve) => held.push(() => resolve(outcome)));
    },
  };
  const uploaded: Blob[] = [];
  const queuedUploads: PictureUpload[] = [];
  let heldAnswers: (() => void)[] | null = null;
  const pictureUploadClient: PictureUploadClient = {
    upload: (file) => {
      uploaded.push(file);
      const upload = queuedUploads.shift() ?? {
        verdict: 'uploaded', pictureId: `picture-${uploaded.length}`, bytes: file.size, mediaType: file.type
      };
      if (heldAnswers === null) return Promise.resolve(upload);
      const held = heldAnswers;
      return new Promise((resolve) => held.push(() => resolve(upload)));
    },
  };
  return {
    sent,
    answerNextWith: (outcome) => {
      queuedOutcomes.push(outcome);
    },
    holdCommands: () => {
      heldCommandAnswers = [];
    },
    releaseCommands: async () => {
      const held = heldCommandAnswers ?? [];
      heldCommandAnswers = null;
      await act(async () => {
        held.forEach((answer) => answer());
        await Promise.resolve();
      });
    },
    uploaded,
    answerNextUploadWith: (upload) => {
      queuedUploads.push(upload);
    },
    holdUploads: () => {
      heldAnswers = [];
    },
    releaseUploads: async () => {
      const held = heldAnswers ?? [];
      heldAnswers = null;
      await act(async () => {
        held.forEach((answer) => answer());
        await Promise.resolve();
      });
    },
    render: (element) => render(createElement(
      ControlSurroundingsContext.Provider,
      {
        value: {
          availability: 'enabled', commandClient, pictureUploadClient, onInstallHeld: () => undefined
        }
      },
      element,
    )),
  };
}

export interface FakeTranscripts {
  readonly follow:       (jobId: string, handlers: TranscriptStreamHandlers) => { close: () => void };
  readonly followedJobs: () => string[];
  readonly feed:         (jobId: string, entries: readonly BoardTranscriptEntryDocument[]) => void;
}

export function fakeTranscripts(): FakeTranscripts {
  const handlersByJob = new Map<string, TranscriptStreamHandlers>();
  return {
    follow: (jobId, handlers) => {
      handlersByJob.set(jobId, handlers);
      return { close: () => handlersByJob.delete(jobId) };
    },
    followedJobs: () => [...handlersByJob.keys()],
    feed:         (jobId, entries) => act(() => handlersByJob.get(jobId)?.onEntries(entries)),
  };
}

/** Clicks a control and lets its command's promise settle inside `act`. */
export async function clickSettled(element: HTMLElement): Promise<void> {
  await act(async () => {
    element.click();
    await Promise.resolve();
  });
}
