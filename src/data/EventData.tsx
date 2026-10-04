import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { playerRecords, type Record } from '../domain/standings';
import type { GameResult, Snapshot, TableName } from '../domain/types';
import { repo } from '../lib/backend';
import type { Repo } from './repo';
import { useToast } from '../components/Toast';

interface EventDataValue {
  data: Snapshot | null;
  loadError: string | null;
  records: Map<string, Record>;
  /** Runs a write, reports failures as a toast, and refreshes the touched tables. Resolves to undefined on failure. */
  run: <T>(tables: TableName[], action: (r: Repo) => Promise<T>) => Promise<T | undefined>;
  /** Optimistically shows a result before the server confirms it. */
  addResultOptimistic: (result: GameResult) => void;
  reload: () => void;
}

const EventDataContext = createContext<EventDataValue | null>(null);

export function EventDataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Snapshot | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const toast = useToast();
  const pending = useRef(new Set<TableName>());
  const timer = useRef<number | undefined>(undefined);

  const loadAll = useCallback(() => {
    setLoadError(null);
    repo
      .fetchAll()
      .then(setData)
      .catch((e: Error) => setLoadError(e.message));
  }, []);

  // Coalesce bursts of change events (e.g. a bracket reset touches two tables) into one fetch per table.
  const refresh = useCallback((tables: TableName[]) => {
    tables.forEach((t) => pending.current.add(t));
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      const due = [...pending.current];
      pending.current.clear();
      try {
        const fresh = await Promise.all(due.map(async (t) => [t, await repo.fetchTable(t)] as const));
        setData((prev) => (prev ? { ...prev, ...Object.fromEntries(fresh) } : prev));
      } catch {
        // A failed background refresh is retried on the next change; the visible data stays as is.
      }
    }, 60);
  }, []);

  useEffect(() => {
    loadAll();
    const unsubscribe = repo.subscribe((t) => refresh([t]));
    // Catch up after the phone wakes or the tab comes back into view.
    const onVisible = () => document.visibilityState === 'visible' && refresh(['players', 'results', 'pairs', 'matches']);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      unsubscribe();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [loadAll, refresh]);

  const run = useCallback<EventDataValue['run']>(
    async (tables, action) => {
      try {
        return await action(repo);
      } catch (e) {
        toast.show((e as Error).message || 'That didn’t save. Check the connection and try again.', { tone: 'error' });
        return undefined;
      } finally {
        refresh(tables);
      }
    },
    [refresh, toast],
  );

  const addResultOptimistic = useCallback((result: GameResult) => {
    setData((prev) => (prev ? { ...prev, results: [...prev.results, result] } : prev));
  }, []);

  const records = useMemo(() => playerRecords(data?.results ?? []), [data?.results]);

  const value = useMemo(
    () => ({ data, loadError, records, run, addResultOptimistic, reload: loadAll }),
    [data, loadError, records, run, addResultOptimistic, loadAll],
  );
  return <EventDataContext.Provider value={value}>{children}</EventDataContext.Provider>;
}

export function useEventData(): EventDataValue {
  const ctx = useContext(EventDataContext);
  if (!ctx) throw new Error('useEventData must be used inside EventDataProvider');
  return ctx;
}
