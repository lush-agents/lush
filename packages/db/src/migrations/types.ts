import type { Kysely } from "kysely";
import type { Database } from "../schema";

export type Migration = {
  id: string;
  up: (db: Kysely<Database>) => Promise<void>;
};
