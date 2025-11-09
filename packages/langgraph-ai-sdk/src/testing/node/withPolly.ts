import type { NodeFunction } from "./types";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { startPolly, persistRecordings } from '../utils';
import { getNodeContext } from "./withContext";
import { kebabCase } from 'change-case';

// withPolly doesn't take any config
type WithPollyConfig = Record<string, never>;

/**
 * Wraps a node function with polly (for testing, when we don't want to use fixtures)
 */
export const withPolly = <TState extends Record<string, unknown>>(
    nodeFunction: NodeFunction<TState>,
    options: WithPollyConfig
): NodeFunction<TState> => {
    return async (state: TState, config: LangGraphRunnableConfig) => {
        if (process.env.NODE_ENV !== 'test') {
            return nodeFunction(state, config);
        }

        const nodeCtx = getNodeContext();
        const nodeName = nodeCtx?.name || 'unknown-node-execution';
        const recordingName = kebabCase(nodeName);

        await startPolly(recordingName);

        try {
            return await nodeFunction(state, config);
        } catch (error) {
            throw error; // Allow withError to handle the error
        } finally {
            await persistRecordings();
        }
    }
}