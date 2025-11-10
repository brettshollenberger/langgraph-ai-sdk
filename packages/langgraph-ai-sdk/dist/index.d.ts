import { n as LanggraphData, r as LanggraphUIMessage, t as InferMessageSchema } from "./types-sX4xw77O.js";
import { BaseMessage } from "@langchain/core/messages";
import { InferUIMessageChunk } from "ai";
import { z } from "zod";
import { CompiledStateGraph } from "@langchain/langgraph";
import { InferMessage, InferMessageSchema as InferMessageSchema$1, InferState, LanggraphDataBase, LanggraphUIMessage as LanggraphUIMessage$1 } from "langgraph-ai-sdk-types";

//#region src/api.d.ts
declare function streamLanggraph<TGraphData extends LanggraphDataBase<any, any>>({
  graphName,
  messageSchema
}: {
  graphName: string;
  messageSchema?: InferMessageSchema$1<TGraphData>;
}): (req: Request) => Promise<Response>;
declare function fetchLanggraphHistory<TGraphData extends LanggraphDataBase<any, any>>({
  graphName,
  messageSchema
}: {
  graphName: string;
  messageSchema?: InferMessageSchema$1<TGraphData>;
}): (req: Request) => Promise<Response>;
//#endregion
//#region src/stream.d.ts
declare function getSchemaKeys<T$1 extends z.ZodObject<any>>(schema: T$1 | undefined): Array<keyof z.infer<T$1>>;
interface LanggraphBridgeConfig<TGraphData extends LanggraphDataBase<any, any>> {
  graph: CompiledStateGraph<InferState<TGraphData>, any>;
  messages: BaseMessage[];
  threadId: string;
  messageSchema?: InferMessageSchema$1<TGraphData>;
  state?: Partial<InferState<TGraphData>>;
}
declare function createLanggraphUIStream<TGraphData extends LanggraphDataBase<any, any>>({
  graph,
  messages,
  threadId,
  messageSchema,
  state
}: LanggraphBridgeConfig<TGraphData>): ReadableStream<InferUIMessageChunk<{
  id: string;
  role: "system" | "user" | "assistant";
  type: string;
  state: "streaming" | "thinking";
} & InferMessage<TGraphData> extends infer T ? { [KeyType in keyof T]: T[KeyType] } : never>>;
declare function createLanggraphStreamResponse<TGraphData extends LanggraphDataBase<any, any>>(options: LanggraphBridgeConfig<TGraphData>): Response;
declare function loadThreadHistory<TGraphData extends LanggraphDataBase<any, any>>(graph: CompiledStateGraph<InferState<TGraphData>, any>, threadId: string, messageSchema?: InferMessageSchema$1<TGraphData>): Promise<{
  messages: LanggraphUIMessage$1<TGraphData>[];
  state: Partial<InferState<TGraphData>>;
}>;
//#endregion
//#region src/registry.d.ts
declare function registerGraph<TData extends LanggraphDataBase<any, any>>(name: string, graph: CompiledStateGraph<InferState<TData>, any, any, any, any, any, any, any, any>): void;
declare function getGraph<TData extends LanggraphDataBase<any, any>>(name: string): CompiledStateGraph<InferState<TData>, any, any, any, any, any, any, any, any> | undefined;
//#endregion
export { InferMessageSchema, LanggraphBridgeConfig, LanggraphData, LanggraphUIMessage, createLanggraphStreamResponse, createLanggraphUIStream, fetchLanggraphHistory, getGraph, getSchemaKeys, loadThreadHistory, registerGraph, streamLanggraph };