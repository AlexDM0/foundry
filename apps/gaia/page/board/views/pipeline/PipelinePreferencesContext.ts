/**
 * The board's preference store, which the Pipeline view provides so a pipeline page keeps User's choices, such as its panel's width, across
 * steps and reloads. Absent, a page keeps them only while it stays mounted.
 */
import { createContext, useContext } from 'react';
import type { PreferenceStore }      from '../../preferences/PreferenceStore.ts';

export const PipelinePreferencesContext = createContext<PreferenceStore | null>(null);

export function usePipelinePreferences(): PreferenceStore | null {
  return useContext(PipelinePreferencesContext);
}
