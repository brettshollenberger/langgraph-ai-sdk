import { AsyncLocalStorage } from 'node:async_hooks';
import type { LangGraphRunnableConfig } from "@langchain/langgraph";

export interface NodeContext {
    name: string;
}

const nodeContext = new AsyncLocalStorage<NodeContext>();

export function getNodeContext(): NodeContext | undefined {
    return nodeContext.getStore();
}

type NodeFunction<TState extends Record<string, unknown>> = (state: TState, config: LangGraphRunnableConfig) => Promise<TState>;

export const withContext = <TState extends Record<string, unknown>>(nodeFunction: NodeFunction<TState>): NodeFunction<TState> => {
    return (state: TState, config: LangGraphRunnableConfig) => {
        const nodeName = config?.metadata?.langgraph_node as string;

        return nodeContext.run({ name: nodeName }, () => {
            return nodeFunction(state, config);
        });
    }
}