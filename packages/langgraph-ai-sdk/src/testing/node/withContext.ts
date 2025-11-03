import { AsyncLocalStorage } from 'node:async_hooks';
import type { LangGraphRunnableConfig } from "@langchain/langgraph";

export interface NodeContext {
    name: string;
    graphName?: string;
}

const nodeContext = new AsyncLocalStorage<NodeContext>();

export function getNodeContext(): NodeContext | undefined {
    return nodeContext.getStore();
}

type NodeFunction<TState extends Record<string, unknown>> = (state: TState, config: LangGraphRunnableConfig) => Promise<Partial<TState>>;

/**
 * Wraps a node function with context that includes node name and graph name
 * The graph name is automatically extracted from config.configurable (thread_id or checkpoint_ns)
 */
export const withContext = <TState extends Record<string, unknown>>(
    nodeFunction: NodeFunction<TState>
): NodeFunction<TState> => {
    return (state: TState, config: LangGraphRunnableConfig) => {
        const nodeName = config?.metadata?.langgraph_node as string;
        const graphName = (config?.context?.graphName) as string | undefined;

        return nodeContext.run({ name: nodeName, graphName }, () => {
            return nodeFunction(state, config);
        });
    }
}