/* Whether the optional AI web search is on for this site, and how many searches this account has left today. */
import type { AiStatus } from '@siyasat/core';
import { create } from 'zustand';
import { api } from '../lib/api';

export const useAi = create<{ status: AiStatus | null }>(() => ({ status: null }));

let asking: Promise<void> | null = null;

/** Ask the server once per visit. A failure is not remembered, so the next page asks again. */
export function loadAiStatus(): Promise<void> {
  asking ??= api.aiStatus().then(
    (status) => useAi.setState({ status }),
    () => {
      asking = null;
    },
  );
  return asking;
}

/** After a search, the server says how many are left. */
export function setAiRemaining(remainingToday: number): void {
  const status = useAi.getState().status;
  if (status?.enabled) useAi.setState({ status: { ...status, remainingToday } });
}
