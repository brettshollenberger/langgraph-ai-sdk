import { z } from 'zod';
import { v7 as uuidv7 } from 'uuid';
import { eq } from 'drizzle-orm';
import { db } from './db/index.js';
import { threads as threadsTable } from './db/schema.js';
import type { CompiledStateGraph } from '@langchain/langgraph';
import type { BaseMessage } from '@langchain/core/messages';
import { HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages';
// import { createLanggraphStreamResponse, loadThreadHistory } from './stream.js';
import type { UIMessage } from 'ai';

interface GraphConfig<TState extends { messages: BaseMessage[] }> {
  graph: CompiledStateGraph<TState, any>;
  messageMetadataSchema?: z.ZodObject<any>;
}

const graphRegistry = new Map<string, GraphConfig<any>>();

export function registerGraph<TState extends { messages: BaseMessage[] }>(
  name: string,
  config: GraphConfig<TState>
) {
  graphRegistry.set(name, config);
}

export function getGraph<TState extends { messages: BaseMessage[] }>(
  name: string
): GraphConfig<TState> | undefined {
  return graphRegistry.get(name);
}

function convertUIMessagesToLanggraph(messages: UIMessage[]): BaseMessage[] {
  return messages.map((msg) => {
    const textPart = msg.parts.find(p => p.type === 'text');
    const text = textPart?.type === 'text' ? textPart.text : '';

    switch (msg.role) {
      case 'user':
        return new HumanMessage(text);
      case 'system':
        return new SystemMessage(text);
      case 'assistant':
        return new AIMessage(text);
      default:
        throw new Error(`Unknown role: ${msg.role}`);
    }
  });
}

async function ensureThread(threadId: string) {
  const existing = await db.select().from(threadsTable).where(eq(threadsTable.threadId, threadId)).limit(1);
  
  if (existing.length === 0) {
    await db.insert(threadsTable).values({
      threadId,
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: {},
      status: 'idle',
      config: {},
      values: null,
      interrupts: {},
    });
  }
  
  return threadId;
}

export function streamLanggraph(graphName: string) {
  return async (req: Request): Promise<Response> => {
    const body = await req.json();
    const uiMessages: UIMessage[] = body.messages;
    let threadId: string = body.threadId;
    
    if (!threadId) {
      threadId = uuidv7();
      await ensureThread(threadId);
    }
    
    const graphConfig = getGraph(graphName);
    
    if (!graphConfig) {
      return new Response(
        JSON.stringify({ error: `Graph '${graphName}' not found` }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    const langGraphMessages = convertUIMessagesToLanggraph(uiMessages);
    const newMessage = langGraphMessages.at(-1);

    if (!newMessage) {
      return new Response(
        JSON.stringify({ error: 'No messages provided' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    const response = createLanggraphStreamResponse({
      graph: graphConfig.graph,
      messages: [newMessage],
      messageMetadataSchema: graphConfig.messageMetadataSchema,
      threadId,
    });
    
    response.headers.set('X-Thread-ID', threadId);
    
    return response;
  };
}

export function fetchLanggraphHistory(graphName: string) {
  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    const threadId = url.searchParams.get('threadId');
    
    if (!threadId) {
      return new Response(
        JSON.stringify({ error: 'threadId required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    const graphConfig = getGraph(graphName);
    
    if (!graphConfig) {
      return new Response(
        JSON.stringify({ error: `Graph '${graphName}' not found` }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    const { messages, state } = await loadThreadHistory(
      graphConfig.graph,
      threadId,
      graphConfig.messageMetadataSchema
    );
    
    return new Response(
      JSON.stringify({ messages, state }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  };
}

export async function createThread(req: Request): Promise<Response> {
  const body = await req.json();
  const threadId = body.threadId || uuidv7();
  
  const existing = await db.select().from(threadsTable).where(eq(threadsTable.threadId, threadId)).limit(1);
  
  if (existing.length > 0) {
    return new Response(
      JSON.stringify({ error: 'Thread already exists' }),
      { status: 409, headers: { 'Content-Type': 'application/json' } }
    );
  }
  
  const [thread] = await db.insert(threadsTable).values({
    threadId,
    createdAt: new Date(),
    updatedAt: new Date(),
    metadata: body.metadata || {},
    status: 'idle',
    config: {},
    values: null,
    interrupts: {},
  }).returning();
  
  return new Response(
    JSON.stringify(thread),
    { headers: { 'Content-Type': 'application/json' } }
  );
}

export async function getThread(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const pathParts = url.pathname.split('/');
  const threadId = pathParts[pathParts.length - 1];
  
  if (!threadId) {
    return new Response(
      JSON.stringify({ error: 'threadId required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }
  
  const thread = await db.select().from(threadsTable).where(eq(threadsTable.threadId, threadId)).limit(1);
  
  if (thread.length === 0) {
    return new Response(
      JSON.stringify({ error: 'Thread not found' }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    );
  }
  
  return new Response(
    JSON.stringify(thread[0]),
    { headers: { 'Content-Type': 'application/json' } }
  );
}
