import type { UIMessage } from 'ai';
import { type BaseMessage } from '@langchain/core/messages';
import { z } from 'zod';
export type InvalidStateError = {
    __error: "The graph state is invalid. It must contain a `messages: BaseMessage[]` property.";
};
export type ValidGraphState = {
    messages: BaseMessage[];
};
export type StructuredMessage = Record<string, unknown>;
export interface LanggraphDataBase<TGraphState extends ValidGraphState, TMessageSchema = undefined> {
    state: TGraphState;
    messageSchema: TMessageSchema;
}
export type InferState<T> = T extends LanggraphDataBase<infer TGraphState, any> ? TGraphState : never;
export type InferMessageSchema<T> = T extends LanggraphDataBase<any, infer TMessageSchema> ? TMessageSchema : never;
export type InferMessage<T> = T extends LanggraphDataBase<any, infer TMessageSchema> ? TMessageSchema extends z.ZodSchema ? z.infer<TMessageSchema> : string : never;
export type LanggraphDataParts<T extends LanggraphDataBase<any, any>> = {
    [K in keyof Omit<InferState<T>, 'messages'> as `state-${K & string}`]: InferState<T>[K];
} & (InferMessageSchema<T> extends z.ZodSchema ? {
    [K in keyof InferMessage<T> as `message-${K & string}`]: InferMessage<T>[K];
} : {
    'message-text': string;
});
export type LanggraphAISDKUIMessage<T extends LanggraphDataBase<any, any>> = UIMessage<unknown, LanggraphDataParts<T>>;
export type MessagePart<T extends LanggraphDataBase<any, any>> = InferMessageSchema<T> extends z.ZodSchema ? {
    [K in keyof InferMessage<T>]: {
        type: K;
        data: InferMessage<T>[K];
        id: string;
    };
}[keyof InferMessage<T>] | {
    type: 'text';
    text: string;
    id: string;
} : {
    type: 'text';
    text: string;
    id: string;
};
export type StatePart<T extends LanggraphDataBase<any, any>> = {
    [K in keyof Omit<InferState<T>, 'messages'>]: {
        type: K;
        data: InferState<T>[K];
        id: string;
    };
}[keyof Omit<InferState<T>, 'messages'>];
export type LanggraphMessage<T extends LanggraphDataBase<any, any>> = {
    id: string;
    role: 'system' | 'user' | 'assistant';
    parts: MessagePart<T>[];
};
export type LanggraphUIMessage<T extends LanggraphDataBase<any, any>> = {
    id: string;
    role: 'system' | 'user' | 'assistant';
    type: string;
    state: 'streaming' | 'thinking';
} & InferMessage<T>;
