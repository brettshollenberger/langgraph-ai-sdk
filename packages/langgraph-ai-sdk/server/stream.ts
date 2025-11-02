import { z } from 'zod';
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  parsePartialJson,
  type UIMessage,
} from 'ai';
import type { CompiledStateGraph, LangGraphRunnableConfig } from '@langchain/langgraph';
import { BaseMessage, AIMessage } from '@langchain/core/messages';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { type ValidGraphState } from '../types';

type StreamChunk = [
  'messages' | 'updates',
  any
] | [
  [string, string],
  'messages' | 'updates', 
  any
];

export interface LanggraphBridgeConfig<
  TState extends ValidGraphState,
  TMessageMetadataSchema extends z.ZodObject<any> | undefined = undefined
> {
  graph: CompiledStateGraph<TState, any>;
  messages: BaseMessage[];
  messageMetadataSchema?: TMessageMetadataSchema;
  threadId: string;
  checkpointer?: PostgresSaver;
}