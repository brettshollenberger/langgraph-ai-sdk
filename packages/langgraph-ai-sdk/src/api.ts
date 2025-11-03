import { v7 as uuidv7 } from 'uuid';
import type { BaseMessage } from '@langchain/core/messages';
import { HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages';
import { createLanggraphStreamResponse, loadThreadHistory } from './stream';
import { getGraph } from './registry';
import { ensureThread } from './ops';
import type { UIMessage } from 'ai';
import type { LanggraphDataBase, InferMessageSchema } from 'langgraph-ai-sdk-types';

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

export function streamLanggraph<TGraphData extends LanggraphDataBase<any, any>>({ graphName, messageSchema }: { graphName: string, messageSchema?: InferMessageSchema<TGraphData> }) {
  return async (req: Request): Promise<Response> => {
    const body = await req.json();
    const uiMessages: UIMessage[] = body.messages;
    const state = body.state || {};
    let threadId: string = body.threadId;
    
    if (!threadId) {
      threadId = uuidv7();
      await ensureThread(threadId);
    }
    
    const graph = getGraph<TGraphData>(graphName);
    
    if (!graph) {
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
    
    const response = createLanggraphStreamResponse<TGraphData>({
      graph,
      messages: [newMessage],
      threadId,
      state,
      messageSchema,
    });
    
    response.headers.set('X-Thread-ID', threadId);
    
    return response;
  };
}

export function fetchLanggraphHistory<TGraphData extends LanggraphDataBase<any, any>>({ graphName, messageSchema }: { graphName: string, messageSchema?: InferMessageSchema<TGraphData> }) {
  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    const threadId = url.searchParams.get('threadId');
    
    if (!threadId) {
      return new Response(
        JSON.stringify({ error: 'threadId required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    const graph = getGraph<TGraphData>(graphName);
    
    if (!graph) {
      return new Response(
        JSON.stringify({ error: `Graph '${graphName}' not found` }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    const { messages, state } = await loadThreadHistory<TGraphData>(
      graph,
      threadId,
      messageSchema
    );
    
    return new Response(
      JSON.stringify({ messages, state }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  };
}