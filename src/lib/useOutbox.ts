"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { OutboxOp } from "./outbox";
import {
  getServerStatus,
  getStatus,
  onDrained,
  retry,
  send,
  startFlusher,
  subscribe,
  type OutboxStatus,
} from "./outboxStore";

export type { OutboxStatus };

/**
 * Read the outbox and write to it. The queue itself lives in `outboxStore`, one
 * per app rather than one per component — see the note there.
 *
 * `drained` must be stable (a `useCallback`), since it is registered and
 * unregistered as it changes.
 */
export function useOutbox(drained?: () => void): {
  send: (op: OutboxOp) => void;
  retry: () => void;
  status: OutboxStatus;
} {
  const status = useSyncExternalStore(subscribe, getStatus, getServerStatus);

  useEffect(() => startFlusher(), []);
  useEffect(() => (drained ? onDrained(drained) : undefined), [drained]);

  return { send, retry, status };
}
