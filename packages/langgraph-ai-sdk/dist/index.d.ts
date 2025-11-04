import { i as LanggraphUIMessage, n as InferMessageSchema, r as LanggraphData, t as ExtractGraphState } from "./types-CvBj0tDP.js";
import { BaseMessage } from "@langchain/core/messages";
import { InferUIMessageChunk } from "ai";
import { z } from "zod";
import { CompiledStateGraph } from "@langchain/langgraph";
import { InferMessageSchema as InferMessageSchema$1, InferState, LanggraphDataBase, LanggraphUIMessage as LanggraphUIMessage$1 } from "langgraph-ai-sdk-types";

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
declare function getSchemaKeys<T extends z.ZodObject<any>>(schema: T): Array<keyof z.infer<T>>;
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
}: LanggraphBridgeConfig<TGraphData>): ReadableStream<InferUIMessageChunk<LanggraphUIMessage$1<TGraphData>>>;
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
export { ExtractGraphState, InferMessageSchema, LanggraphBridgeConfig, LanggraphData, LanggraphUIMessage, createLanggraphStreamResponse, createLanggraphUIStream, fetchLanggraphHistory, getGraph, getSchemaKeys, loadThreadHistory, registerGraph, streamLanggraph };