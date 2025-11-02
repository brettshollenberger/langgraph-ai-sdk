import type { UIMessage } from 'ai';
import { type BaseMessage } from '@langchain/core/messages'
import { z } from 'zod';

export type InvalidStateError = {
  __error: "The graph state is invalid. It must contain a `messages: BaseMessage[]` property."
};
export type ValidGraphState = { messages: BaseMessage[] }

export type StructuredMessage = Record<string, unknown>

export interface LanggraphDataBase<
    TGraphState extends ValidGraphState,
    TMessageSchema extends z.ZodType | undefined = undefined
> {
    state: TGraphState,
    messageSchema: TMessageSchema
}

export type InferState<T> = T extends LanggraphDataBase<infer TGraphState, any>
? TGraphState
: never

export type InferMessageSchema<T> = T extends LanggraphDataBase<any, infer TMessageSchema>
? TMessageSchema
: never

export type InferMessage<T> = T extends LanggraphDataBase<any, infer TMessageSchema>
  ? TMessageSchema extends z.ZodType
    ? z.infer<TMessageSchema>
    : string
  : never

export type LanggraphDataParts<T extends LanggraphDataBase<any, any>> =
& { [K in keyof Omit<InferState<T>, 'messages'> as `state-${K & string}`]: InferState<T>[K] }
& (InferMessageSchema<T> extends z.ZodType
    ? { [K in keyof InferMessage<T> as `message-${K & string}`]: InferMessage<T>[K] }
    : { 'message-text': string });

export type LanggraphUIMessage<T extends LanggraphDataBase<any, any>> = UIMessage<
    unknown,
    LanggraphDataParts<T>
>
