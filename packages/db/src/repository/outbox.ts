import { syncOutbox } from "../schema";
import type { Db, RepositoryDeps } from "./types";

type Entity = (typeof syncOutbox.$inferInsert)["entity"];
type Op = (typeof syncOutbox.$inferInsert)["op"];

/** Records a change for the Phase 5 sync engine. Always call inside the mutation's transaction. */
export function enqueue<R>(tx: Db<R>, deps: RepositoryDeps, entity: Entity, entityId: string, op: Op): void {
  tx.insert(syncOutbox).values({ entity, entityId, op, createdAt: deps.now() }).run();
}
