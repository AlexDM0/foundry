/**
 * A board's Talos for a spec that drives its children through Talos's adapter and plays each child's part itself: every frame is kept and
 * answered `done` while it answers at all, each launch plants its child record as Talos writes it at a launch, running, and the spec plants
 * a live child or an end Talos would record. Test-only.
 */
import { join } from 'node:path';

import type { DoneFrame }                          from '../domain/talos/@types/TalosFrame.ts';
import type { ChildLaunch }                        from '../domain/talos/ChildLaunch.ts';
import type { ChildEnd }                           from '../domain/talos/ChildRecord.ts';
import type { PlatformPorts }                      from '../lib/platform-ports/PlatformPortsFor.ts';
import type { BoardChildren }                      from '../services/hephaestus/BoardChildren.ts';
import { createTalosChildren }                     from '../services/hephaestus/TalosChildren.ts';
import type { TalosConnection, TalosFrameRequest } from '../services/hephaestus/TalosConnection.ts';
import { PlantedChild }                            from './PlantedChild.ts';

export interface FrameRecordingTalos {
  /** Talos's adapter of the board's children over this Talos, whose Talos reads as live. */
  readonly boardChildren:   BoardChildren;
  /** Every frame Talos answered, in order, with no frame id. */
  readonly frames:          () => readonly TalosFrameRequest[];
  /** Every launch taken, in order. */
  readonly launches:        () => readonly ChildLaunch[];
  /** The folders of the launches taken, as absolute paths, in order. */
  readonly launchedFolders: () => readonly string[];
  /** The launch taken for the child of `childFolder`, an absolute folder, at `instance`; `null` for none. */
  readonly launchOf:        (childFolder: string, instance: number) => ChildLaunch | null;
  /** A running agent child of `childFolder`, an absolute folder, as one an earlier Hephaestus launched. */
  readonly plantLiveChild:  (childFolder: string, instance: number) => void;
  /** The child's record ended as Talos records `end`: exited 0 unless it says otherwise. */
  readonly endChild:        (childFolder: string, instance: number, end?: Partial<ChildEnd>) => void;
  /** While false, a frame gets no answer, as from a Talos that does not serve; nothing is kept. */
  readonly answers:         (answering: boolean) => void;
}

export function frameRecordingTalos(boardFolder: string, platformPorts: PlatformPorts): FrameRecordingTalos {
  const frames: TalosFrameRequest[] = [];
  let answering = true;
  let lastFrameId = 0;
  const relativeFolderOf = (childFolder: string): string => childFolder.slice(boardFolder.length + 1).split(/[\\/]/u).join('/');
  const launches = (): ChildLaunch[] => frames.flatMap((frame) => (frame.kind === 'launch' ? [frame.launch] : []));
  const answerOf = (frame: TalosFrameRequest): DoneFrame => {
    lastFrameId += 1;
    const done: DoneFrame = { kind: 'done', frameId: lastFrameId, verdict: 'done' };
    if (frame.kind !== 'launch') return done;
    const { launch } = frame;
    if (launches().some((taken) => taken.childFolder === launch.childFolder && taken.instance === launch.instance)) return { ...done, verdict: 'already-done' };
    PlantedChild.plantChildRecord({ boardFolder, childFolder: launch.childFolder, instance: launch.instance }, {
      kind: launch.kind, label: launch.label, workingDirectory: launch.workingDirectory, timeBoundMilliseconds: launch.timeBoundMilliseconds,
    });
    return done;
  };
  const connection: TalosConnection = {
    send: (frame) => {
      if (!answering) return Promise.resolve('no-answer');
      const answer = answerOf(frame);
      frames.push(frame);
      return Promise.resolve(answer);
    },
    onState: () => undefined,
    onClose: () => undefined,
    close:   () => undefined,
  };
  return {
    boardChildren: createTalosChildren({
      boardFolder, platformPorts, connection: () => connection, talosLiveness: () => true
    }),
    frames:          () => frames,
    launches,
    launchedFolders: () => launches().map((launch) => join(boardFolder, ...launch.childFolder.split('/'))),
    launchOf:        (childFolder, instance) => launches().find((launch) => launch.childFolder === relativeFolderOf(childFolder) && launch.instance === instance) ?? null,
    plantLiveChild:  (childFolder, instance) => {
      PlantedChild.plantChildRecord({ boardFolder, childFolder: relativeFolderOf(childFolder), instance });
    },
    endChild: (childFolder, instance, end = {}) => {
      PlantedChild.plantChildRecord({ boardFolder, childFolder: relativeFolderOf(childFolder), instance }, {
        kind:  'line',
        state: 'ended',
        end:   {
          reason: 'exited', exitCode: 0, signal: null, detail: null, runMilliseconds: 0, ...end
        },
      });
    },
    answers: (nowAnswering) => {
      answering = nowAnswering;
    },
  };
}
