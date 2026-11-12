/**
 * The follower of a gate profile's output stream, which the Pipeline view provides from the shell's services, so the gate dialog on any of
 * its screens reads the output from the stream route. Absent, a dialog shows no output.
 */
import { createContext, useContext } from 'react';

import type { ProfileLogFollower } from './dialogs/ProfileBox.tsx';

export const ProfileLogFollowerContext = createContext<ProfileLogFollower | null>(null);

export function useProfileLogFollower(): ProfileLogFollower | null {
  return useContext(ProfileLogFollowerContext);
}
