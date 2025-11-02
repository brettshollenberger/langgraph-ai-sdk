import { CompiledStateGraph } from '@langchain/langgraph'
import { type BaseMessage } from '@langchain/core/messages'
import { type UIMessage } from 'ai'

export type InvalidStateError = {
  __error: "The graph state is invalid. It must contain a `messages: BaseMessage[]` property."
};

type ValidGraphState = { messages: BaseMessage[] }

export type ExtractGraphState<T> = T extends CompiledStateGraph<infer S, any, any, any, any, any, any, any, any> ? S : never

export type StructuredMessage = Record<string, unknown>
export interface LanggraphDataBase<
    TGraph,
    TStructuredMessage extends string | StructuredMessage = string
> {
    state: ExtractGraphState<TGraph>,
    message: TStructuredMessage
}
// Factory type
export type LanggraphData<
    TGraph,
    TStructuredMessage extends string | StructuredMessage = string
> = ExtractGraphState<TGraph> extends ValidGraphState
        ? LanggraphDataBase<TGraph, TStructuredMessage>
        : InvalidStateError

// Extract graph type
export type InferGraph<T> = T extends LanggraphDataBase<infer TGraph, any>
? TGraph
: never

// Extract state
export type InferState<T> = T extends LanggraphDataBase<infer TGraph, any>
? ExtractGraphState<TGraph>
: never

// Extract custom message
export type InferMessage<T> = T extends LanggraphDataBase<any, infer TMessage>
? TMessage
: never

export type LanggraphDataParts<T extends LanggraphDataBase<any, any>> = 
    | { type: 'state', data: InferState<T> }
    | ([InferMessage<T>] extends [never] 
        ? never 
        : { type: 'message', data: InferMessage<T> })

export type LanggraphUIMessage<T extends LanggraphDataBase<any, any>> = UIMessage<
    unknown,
    LanggraphDataParts<T>
>
