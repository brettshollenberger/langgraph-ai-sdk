import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { NodeFunction, NodeMiddlewareType } from "./types";

type ReportingFn = (error: Error) => void;

const preconfiguredReporters: Record<string, ReportingFn> = {
    console: (error) => console.error(error),
}

class Reporters {
    reporters: ReportingFn[] = [];
    addReporter(reporter: ReportingFn | string): this {
        if (typeof reporter === "string") {
            if (!preconfiguredReporters[reporter]) {
                throw new Error(`Reporter ${reporter} not found`);
            }
            this.reporters.push(preconfiguredReporters[reporter]);
        } else {
            this.reporters.push(reporter);
        }
        return this;
    }
    list(): ReportingFn[] {
        return this.reporters;
    }
    report(error: Error) {
        this.reporters.forEach(reporter => reporter(error));
    }
}

export const ErrorReporters = new Reporters();

type WithErrorHandlingConfig = {}
/**
 * Wraps a node function with error handling
 */
export const withErrorHandling: NodeMiddlewareType<WithErrorHandlingConfig> = <TState extends Record<string, unknown>>(
    nodeFunction: NodeFunction<TState>
): NodeFunction<TState> => {
    return async (state: TState, config: LangGraphRunnableConfig) => {
        try {
            return await nodeFunction(state, config);
        } catch (error) {
            console.log(`caught error`)
            ErrorReporters.report(error as Error);
            throw error;
        }
    }
}