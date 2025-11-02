import { CompiledStateGraph } from "@langchain/langgraph";
import type { LanggraphData, InferState } from "./types.ts";

const graphRegistry = new Map<string, CompiledStateGraph<any, any>>();

export function registerGraph<TData extends LanggraphData<any, any>>(
  name: string,
  graph: CompiledStateGraph<InferState<TData>, any>
) {
  graphRegistry.set(name, graph);
}

export function getGraph<TData extends LanggraphData<any, any>>(
  name: string
): CompiledStateGraph<InferState<TData>, any> | undefined {
  return graphRegistry.get(name);
}