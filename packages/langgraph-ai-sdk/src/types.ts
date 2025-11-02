import { CompiledStateGraph } from '@langchain/langgraph'
import { z } from 'zod'
import type { 
    ValidGraphState, 
    LanggraphDataBase,
    InvalidStateError
} from '@langgraph-ai-sdk/types';

export type ExtractGraphState<T> = T extends CompiledStateGraph<infer S, any, any, any, any, any, any, any, any> ? S : never

export type LanggraphData<
    TGraph,
    TMessageSchema extends z.ZodType | undefined = undefined
> = ExtractGraphState<TGraph> extends ValidGraphState
        ? LanggraphDataBase<ExtractGraphState<TGraph>, TMessageSchema>
        : InvalidStateError

export { type LanggraphUIMessage, type InferMessageSchema } from '@langgraph-ai-sdk/types';