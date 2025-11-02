import { CompiledStateGraph } from '@langchain/langgraph'
import type { 
    ValidGraphState, 
    StructuredMessage,
    LanggraphDataBase,
    InvalidStateError
} from '@langgraph-ai-sdk/types';

export type ExtractGraphState<T> = T extends CompiledStateGraph<infer S, any, any, any, any, any, any, any, any> ? S : never

// Factory type
export type LanggraphData<
    TGraph,
    TStructuredMessage extends string | StructuredMessage = string
> = ExtractGraphState<TGraph> extends ValidGraphState
        ? LanggraphDataBase<ExtractGraphState<TGraph>, TStructuredMessage>
        : InvalidStateError

export { type LanggraphUIMessage } from '@langgraph-ai-sdk/types';