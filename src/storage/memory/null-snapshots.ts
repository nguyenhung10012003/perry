import type { PlayerSnapshotV1 } from '../../music/persistence/snapshot.js';
import type { SnapshotStore } from '../types.js';

/** Snapshots are not kept (memory driver). */
export class NullSnapshotStore implements SnapshotStore {
  save(): Promise<boolean> {
    return Promise.resolve(false);
  }

  load(): Promise<PlayerSnapshotV1 | null> {
    return Promise.resolve(null);
  }

  delete(): Promise<void> {
    return Promise.resolve();
  }

  listGuildIds(): Promise<string[] | null> {
    return Promise.resolve([]);
  }
}
