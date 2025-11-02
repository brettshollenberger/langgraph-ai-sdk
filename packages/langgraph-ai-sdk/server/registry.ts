import { z } from "zod";
import { CompiledStateGraph } from "@langchain/langgraph";
import type { LanggraphData, InferState } from "../types.js";

interface GraphConfig<TData extends LanggraphData<any, any>> {
  graph: CompiledStateGraph<InferState<TData>, any>;
  messageMetadataSchema?: z.ZodObject<any>;
}

const graphRegistry = new Map<string, GraphConfig<any>>();

export function registerGraph<TData extends LanggraphData<any, any>>(
  name: string,
  config: GraphConfig<TData>
) {
  graphRegistry.set(name, config);
}

export function getGraph<TData extends LanggraphData<any, any>>(
  name: string
): GraphConfig<TData> | undefined {
  return graphRegistry.get(name);
}