import { CompiledStateGraph } from '@langchain/langgraph'
import { z } from 'zod'
import type { 
    ValidGraphState, 
    LanggraphDataBase,
    InvalidStateError
} from '@langgraph-ai-sdk/types';

export type ExtractGraphState<T> = T extends CompiledStateGraph<infer S, any, any, any, any, any, any, any, any> ? S : never

export type LanggraphData<
    TState,
    TMessageSchema = undefined
> = TState extends ValidGraphState
        ? LanggraphDataBase<TState, TMessageSchema>
        : InvalidStateError

export { type LanggraphAISDKUIMessage, type InferMessageSchema } from '@langgraph-ai-sdk/types';