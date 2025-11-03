import { CompiledStateGraph } from "@langchain/langgraph";
import { InferMessageSchema as InferMessageSchema$1, InvalidStateError, LanggraphDataBase, LanggraphUIMessage as LanggraphUIMessage$1, ValidGraphState } from "@langgraph-ai-sdk/types";

//#region src/types.d.ts
type ExtractGraphState<T> = T extends CompiledStateGraph<infer S, any, any, any, any, any, any, any, any> ? S : never;
type LanggraphData<TState, TMessageSchema = undefined> = TState extends ValidGraphState ? LanggraphDataBase<TState, TMessageSchema> : InvalidStateError;
//#endregion
export { LanggraphUIMessage$1 as i, InferMessageSchema$1 as n, LanggraphData as r, ExtractGraphState as t };