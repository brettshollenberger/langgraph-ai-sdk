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

// export type DataStateUIPart<TData extends LanggraphDataBase<any, any>> = ValueOf<{
//     [NAME in keyof Omit<InferState<TData>, 'messages'> & string]: {
//         type: `state-${NAME}`;
//         id?: string;
//         data: InferState<TData>[NAME];
//     }
// }>;

// export type DataMessageUIPart<TData extends LanggraphDataBase<any, any>> =
//     InferMessage<TData> extends StructuredMessage
//         ? ValueOf<{
//             [NAME in keyof InferMessage<TData> & string]: {
//                 type: `message-${NAME}`;
//                 id?: string;
//                 data: InferMessage<TData>[NAME];
//             }
//         }>
//         : InferMessage<TData> extends string
//             ? {
//                 type: 'message-text';
//                 id?: string;
//                 data: string;
//             }
//             : never;

// export type LanggraphDataParts<T extends LanggraphDataBase<any, any>> =
//     Merge<
//         DataStateUIPart<T>,
//         DataMessageUIPart<T>
//     >;
export type LanggraphDataParts<T extends LanggraphDataBase<any, any>> =
& { [K in keyof Omit<InferState<T>, 'messages'> as `state-${K & string}`]:
  InferState<T>[K] }
    & (InferMessage<T> extends StructuredMessage
        ? { [K in keyof InferMessage<T> as `message-${K & string}`]:
  InferMessage<T>[K] }
        : { 'message-text': string });


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
