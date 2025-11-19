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
export interface LanggraphData<TGraphState extends ValidGraphState, TMessageSchema = undefined> {
    state: TGraphState;
    messageSchema: TMessageSchema;
}
export type InferState<T> = T extends LanggraphData<infer TGraphState, any> ? TGraphState : never;
export type InferMessageSchema<T> = T extends LanggraphData<any, infer TMessageSchema> ? TMessageSchema : never;
export type InferMessage<T> = T extends LanggraphData<any, infer TMessageSchema> ? TMessageSchema extends readonly z.ZodSchema[] ? z.infer<TMessageSchema[number]> : TMessageSchema extends z.ZodSchema ? z.infer<TMessageSchema> : string : never;
type InferZodMessageKeys<TSchema> = {
    [K in keyof InferMessage<TSchema> as `message-${K & string}`]: InferMessage<TSchema>[K];
};
type MessagePartKeys<TSchema> = TSchema extends readonly z.ZodSchema[] ? InferZodMessageKeys<TSchema> : TSchema extends z.ZodSchema ? InferZodMessageKeys<TSchema> : {
    'message-text': string;
};
type StatePartKeys<TState> = TState extends ValidGraphState ? {
    [K in keyof Omit<InferState<TState>, 'messages'> as `state-${K & string}`]: InferState<TState>[K];
} : never;
type ContentBlockParts<T extends LanggraphData<any, any>> = {
    'data-content-block-text': {
        index: number;
        id: string;
        text: string;
    };
    'data-content-block-structured': {
        index: number;
        id: string;
        data: InferMessage<T>;
        sourceText?: string;
    };
    'data-content-block-reasoning': {
        index: number;
        id: string;
        text: string;
    };
};
export type LanggraphDataParts<T extends LanggraphData<any, any>> = StatePartKeys<T> & MessagePartKeys<InferMessageSchema<T>> & ContentBlockParts<T>;
export type LanggraphAISDKUIMessage<T extends LanggraphData<any, any>> = UIMessage<unknown, LanggraphDataParts<T>>;
export type MessagePart<T extends LanggraphData<any, any>> = InferMessageSchema<T> extends readonly z.ZodSchema[] ? {
    [K in keyof InferMessage<T>]: {
        type: K;
        data: InferMessage<T>[K];
        id: string;
    };
}[keyof InferMessage<T>] | {
    type: 'text';
    text: string;
    id: string;
} : InferMessageSchema<T> extends z.ZodSchema ? {
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
export type StatePart<T extends LanggraphData<any, any>> = {
    [K in keyof Omit<InferState<T>, 'messages'>]: {
        type: K;
        data: InferState<T>[K];
        id: string;
    };
}[keyof Omit<InferState<T>, 'messages'>];
export type LanggraphMessage<T extends LanggraphData<any, any>> = {
    id: string;
    role: 'system' | 'user' | 'assistant';
    parts: MessagePart<T>[];
};
export type LanggraphUIMessage<T extends LanggraphData<any, any>> = UIMessage<unknown, LanggraphDataParts<T>>;
type Prettify<T> = {
    [K in keyof T]: T[K];
} & {};
export type _SimpleLanggraphUIMessage<T extends LanggraphData<any, any>> = {
    id: string;
    role: 'system' | 'user' | 'assistant';
    state?: 'streaming' | 'thinking';
} & ({
    type: 'text';
    text: string;
} | InferMessage<T>);
export type SimpleLanggraphUIMessage<T extends LanggraphData<any, any>> = T extends any ? Prettify<_SimpleLanggraphUIMessage<T>> : never;
export type MessageBlock<T extends LanggraphData<any, any>> = TextMessageBlock | StructuredMessageBlock<T> | ToolCallMessageBlock | ReasoningMessageBlock;
export interface TextMessageBlock {
    type: 'text';
    index: number;
    text: string;
    id: string;
}
export interface StructuredMessageBlock<T extends LanggraphData<any, any>> {
    type: 'structured';
    index: number;
    data: InferMessage<T>;
    sourceText?: string;
    id: string;
}
export interface ToolCallMessageBlock {
    type: 'tool_call';
    index: number;
    toolCallId: string;
    toolName: string;
    input: any;
    output?: any;
    state: 'running' | 'complete' | 'error';
    errorText?: string;
    id: string;
}
export interface ReasoningMessageBlock {
    type: 'reasoning';
    index: number;
    text: string;
    id: string;
}
export type MessageWithBlocks<T extends LanggraphData<any, any>> = {
    id: string;
    role: 'system' | 'user' | 'assistant';
    blocks: MessageBlock<T>[];
};
export {};
