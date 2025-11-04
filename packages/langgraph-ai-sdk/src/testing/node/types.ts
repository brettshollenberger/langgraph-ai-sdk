import type { LangGraphRunnableConfig } from "@langchain/langgraph";

export type NodeFunction<TState extends Record<string, unknown>> = (
  state: TState,
  config: LangGraphRunnableConfig
) => Promise<Partial<TState>> | Partial<TState>;

export type MiddlewareConfigType = Record<string, unknown>;

export interface NodeMiddlewareType<TConfig extends MiddlewareConfigType> {
  <TState extends Record<string, unknown>>(
    node: NodeFunction<TState>,
    options: TConfig
  ): NodeFunction<TState>;
  _config?: TConfig;
}