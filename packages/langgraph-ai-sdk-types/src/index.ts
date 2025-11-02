import type { UIMessage } from 'ai';
import { type BaseMessage } from '@langchain/core/messages'

export type InvalidStateError = {
  __error: "The graph state is invalid. It must contain a `messages: BaseMessage[]` property."
};
export type ValidGraphState = { messages: BaseMessage[] }

export type StructuredMessage = Record<string, unknown>

export interface LanggraphDataBase<
    TGraphState extends ValidGraphState,
    TStructuredMessage extends string | StructuredMessage = string
> {
    state: TGraphState,
    message: TStructuredMessage
}

// Extract state
export type InferState<T> = T extends LanggraphDataBase<infer TGraphState, any>
? TGraphState
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
    unknown, // TODO: Add metadata type
    LanggraphDataParts<T>
    // TODO: Add tool calls type
>

// TODO:
// I THINK WE CAN DELETE THESE
// export interface FrontendMessagePart<TMessageMetadata extends Record<string, any>> {
//   type: 'text' | keyof TMessageMetadata;
//   id?: string;
//   text?: string;
//   data?: any;
// }

// export interface FrontendMessage<TMessageMetadata extends Record<string, any>> {
//   id: string;
//   role: 'user' | 'assistant' | 'system';
//   parts: FrontendMessagePart<TMessageMetadata>[];
// }
