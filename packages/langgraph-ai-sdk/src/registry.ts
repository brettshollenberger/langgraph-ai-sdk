import { CompiledStateGraph } from "@langchain/langgraph";
import type { LanggraphDataBase, InferState } from "@langgraph-ai-sdk/types";

const graphRegistry = new Map<string, CompiledStateGraph<any, any>>();

export function registerGraph<TData extends LanggraphDataBase<any, any>>(
  name: string,
  graph: CompiledStateGraph<InferState<TData>, any, any, any, any, any, any, any, any>
) {
  graphRegistry.set(name, graph);
}

export function getGraph<TData extends LanggraphDataBase<any, any>>(
  name: string
): CompiledStateGraph<InferState<TData>, any, any, any, any, any, any, any, any> | undefined {
  return graphRegistry.get(name)
}