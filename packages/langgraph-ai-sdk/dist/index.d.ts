import { n as LanggraphData, r as LanggraphUIMessage, t as InferMessageSchema } from "./types-BEZu6l5V.js";
import { BaseMessage } from "@langchain/core/messages";
import { InferUIMessageChunk, UIMessage } from "ai";
import { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as drizzle_orm_pg_core0 from "drizzle-orm/pg-core";
import { z } from "zod";
import { CompiledStateGraph } from "@langchain/langgraph";
import { InferMessageSchema as InferMessageSchema$1, InferState, LanggraphData as LanggraphData$1, LanggraphUIMessage as LanggraphUIMessage$1 } from "langgraph-ai-sdk-types";
import { Pool } from "pg";

//#region src/api.d.ts
/**
 * Core function that works with parsed data - framework agnostic
 * Use this when you've already parsed the request body (e.g., in Hono, Express, etc.)
 */
declare function streamLanggraph<TGraphData extends LanggraphData$1<any, any>>({
  graph,
  messageSchema,
  messages,
  state,
  threadId
}: {
  graph: CompiledStateGraph<any, any>;
  messageSchema?: InferMessageSchema$1<TGraphData>;
  messages: UIMessage[];
  state?: any;
  threadId?: string;
}): Promise<Response>;
/**
 * Core function that works with parsed data - framework agnostic
 * Use this when you've already extracted the threadId from the request (e.g., in Hono, Express, etc.)
 */
declare function fetchLanggraphHistory<TGraphData extends LanggraphData$1<any, any>>({
  graph,
  messageSchema,
  threadId
}: {
  graph: CompiledStateGraph<any, any>;
  messageSchema?: InferMessageSchema$1<TGraphData>;
  threadId: string;
}): Promise<Response>;
//#endregion
//#region src/stream.d.ts
declare function getSchemaKeys<T extends z.ZodObject<any>>(schema: T | undefined): Array<keyof z.infer<T>>;
interface LanggraphBridgeConfig<TGraphData extends LanggraphData$1<any, any>> {
  graph: CompiledStateGraph<InferState<TGraphData>, any>;
  messages: BaseMessage[];
  threadId: string;
  messageSchema?: InferMessageSchema$1<TGraphData>;
  state?: Partial<InferState<TGraphData>>;
}
declare function createLanggraphUIStream<TGraphData extends LanggraphData$1<any, any>>({
  graph,
  messages,
  threadId,
  messageSchema,
  state
}: LanggraphBridgeConfig<TGraphData>): ReadableStream<InferUIMessageChunk<LanggraphUIMessage$1<TGraphData>>>;
declare function createLanggraphStreamResponse<TGraphData extends LanggraphData$1<any, any>>(options: LanggraphBridgeConfig<TGraphData>): Response;
declare function loadThreadHistory<TGraphData extends LanggraphData$1<any, any>>(graph: CompiledStateGraph<InferState<TGraphData>, any>, threadId: string, messageSchema?: InferMessageSchema$1<TGraphData>): Promise<{
  messages: LanggraphUIMessage$1<TGraphData>[];
  state: Partial<InferState<TGraphData>>;
}>;
declare namespace schema_d_exports {
  export { NewThread, Thread, threads };
}
declare const threads: drizzle_orm_pg_core0.PgTableWithColumns<{
  name: "threads";
  schema: undefined;
  columns: {
    threadId: drizzle_orm_pg_core0.PgColumn<{
      name: "thread_id";
      tableName: "threads";
      dataType: "string";
      columnType: "PgUUID";
      data: string;
      driverParam: string;
      notNull: true;
      hasDefault: true;
      isPrimaryKey: true;
      isAutoincrement: false;
      hasRuntimeDefault: false;
      enumValues: undefined;
      baseColumn: never;
      identity: undefined;
      generated: undefined;
    }, {}, {}>;
    createdAt: drizzle_orm_pg_core0.PgColumn<{
      name: "created_at";
      tableName: "threads";
      dataType: "date";
      columnType: "PgTimestamp";
      data: Date;
      driverParam: string;
      notNull: false;
      hasDefault: true;
      isPrimaryKey: false;
      isAutoincrement: false;
      hasRuntimeDefault: false;
      enumValues: undefined;
      baseColumn: never;
      identity: undefined;
      generated: undefined;
    }, {}, {}>;
    updatedAt: drizzle_orm_pg_core0.PgColumn<{
      name: "updated_at";
      tableName: "threads";
      dataType: "date";
      columnType: "PgTimestamp";
      data: Date;
      driverParam: string;
      notNull: false;
      hasDefault: true;
      isPrimaryKey: false;
      isAutoincrement: false;
      hasRuntimeDefault: false;
      enumValues: undefined;
      baseColumn: never;
      identity: undefined;
      generated: undefined;
    }, {}, {}>;
    metadata: drizzle_orm_pg_core0.PgColumn<{
      name: "metadata";
      tableName: "threads";
      dataType: "json";
      columnType: "PgJsonb";
      data: unknown;
      driverParam: unknown;
      notNull: true;
      hasDefault: true;
      isPrimaryKey: false;
      isAutoincrement: false;
      hasRuntimeDefault: false;
      enumValues: undefined;
      baseColumn: never;
      identity: undefined;
      generated: undefined;
    }, {}, {}>;
    status: drizzle_orm_pg_core0.PgColumn<{
      name: "status";
      tableName: "threads";
      dataType: "string";
      columnType: "PgText";
      data: string;
      driverParam: string;
      notNull: true;
      hasDefault: true;
      isPrimaryKey: false;
      isAutoincrement: false;
      hasRuntimeDefault: false;
      enumValues: [string, ...string[]];
      baseColumn: never;
      identity: undefined;
      generated: undefined;
    }, {}, {}>;
    config: drizzle_orm_pg_core0.PgColumn<{
      name: "config";
      tableName: "threads";
      dataType: "json";
      columnType: "PgJsonb";
      data: unknown;
      driverParam: unknown;
      notNull: true;
      hasDefault: true;
      isPrimaryKey: false;
      isAutoincrement: false;
      hasRuntimeDefault: false;
      enumValues: undefined;
      baseColumn: never;
      identity: undefined;
      generated: undefined;
    }, {}, {}>;
    values: drizzle_orm_pg_core0.PgColumn<{
      name: "values";
      tableName: "threads";
      dataType: "json";
      columnType: "PgJsonb";
      data: unknown;
      driverParam: unknown;
      notNull: false;
      hasDefault: false;
      isPrimaryKey: false;
      isAutoincrement: false;
      hasRuntimeDefault: false;
      enumValues: undefined;
      baseColumn: never;
      identity: undefined;
      generated: undefined;
    }, {}, {}>;
    interrupts: drizzle_orm_pg_core0.PgColumn<{
      name: "interrupts";
      tableName: "threads";
      dataType: "json";
      columnType: "PgJsonb";
      data: unknown;
      driverParam: unknown;
      notNull: false;
      hasDefault: true;
      isPrimaryKey: false;
      isAutoincrement: false;
      hasRuntimeDefault: false;
      enumValues: undefined;
      baseColumn: never;
      identity: undefined;
      generated: undefined;
    }, {}, {}>;
  };
  dialect: "pg";
}>;
type Thread = typeof threads.$inferSelect;
type NewThread = typeof threads.$inferInsert;
//#endregion
//#region src/config.d.ts
type DrizzleDb = NodePgDatabase<typeof schema_d_exports>;
/**
 * Initialize the library with your database connection
 * This should be called once at app startup before using any API functions
 *
 * @example
 * ```typescript
 * import { Pool } from 'pg';
 * import { initializeLanggraph } from 'langgraph-ai-sdk';
 *
 * const pool = new Pool({ connectionString: process.env.DATABASE_URL });
 * initializeLanggraph({ pool });
 * ```
 */
declare function initializeLanggraph({
  pool
}: {
  pool: Pool;
}): void;
/**
 * Get the configured database instance
 * Throws an error if the library hasn't been initialized
 */
declare function getDb(): DrizzleDb;
/**
 * Get the configured pool instance
 * Throws an error if the library hasn't been initialized
 */
declare function getPool(): Pool;
/**
 * Check if the library has been initialized
 */
declare function isInitialized(): boolean;
//#endregion
export { InferMessageSchema, LanggraphBridgeConfig, LanggraphData, LanggraphUIMessage, createLanggraphStreamResponse, createLanggraphUIStream, fetchLanggraphHistory, getDb, getPool, getSchemaKeys, initializeLanggraph, isInitialized, loadThreadHistory, streamLanggraph };