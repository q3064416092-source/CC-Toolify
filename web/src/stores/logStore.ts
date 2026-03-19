import { create } from 'zustand';
import type { RequestLog, LogStatus } from '@/types';

interface LogState {
  logs: RequestLog[];
  filter: LogStatus | 'all';
  setLogs: (logs: RequestLog[]) => void;
  setFilter: (filter: LogStatus | 'all') => void;
  getFilteredLogs: () => RequestLog[];
  getStats: () => { ok: number; error: number; started: number };
}

export const useLogStore = create<LogState>((set, get) => ({
  logs: [],
  filter: 'all',

  setLogs: (logs) => set({ logs }),
  setFilter: (filter) => set({ filter }),

  getFilteredLogs: () => {
    const { logs, filter } = get();
    if (filter === 'all') return logs;
    return logs.filter((log) => log.status === filter);
  },

  getStats: () => {
    const { logs } = get();
    return {
      ok: logs.filter((l) => l.status === 'ok').length,
      error: logs.filter((l) => l.status === 'error').length,
      started: logs.filter((l) => l.status === 'started').length,
    };
  },
}));
