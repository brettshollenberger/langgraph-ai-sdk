import { v7 as uuidv7 } from 'uuid';
import type { BaseMessage } from '@langchain/core/messages';
import { HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages';
import { createLanggraphStreamResponse, loadThreadHistory } from './stream.ts';
import { getGraph } from './registry.ts';
import { ensureThread } from './ops.js';
import type { UIMessage } from 'ai';
import type { LanggraphData } from './types.ts';

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

export function streamLanggraph<TGraphData extends LanggraphData<any, any>>(graphName: string) {
  return async (req: Request): Promise<Response> => {
    const body = await req.json();
    const uiMessages: UIMessage[] = body.messages;
    let threadId: string = body.threadId;
    
    if (!threadId) {
      threadId = uuidv7();
      await ensureThread(threadId);
    }
    
    const graphConfig = getGraph<TGraphData>(graphName);
    
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
    
    const response = createLanggraphStreamResponse<TGraphData>({
      graph: graphConfig.graph,
      messages: [newMessage],
      messageMetadataSchema: graphConfig.messageMetadataSchema,
      threadId,
    });
    
    response.headers.set('X-Thread-ID', threadId);
    
    return response;
  };
}

export function fetchLanggraphHistory<TGraphData extends LanggraphData<any, any>>(graphName: string) {
  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    const threadId = url.searchParams.get('threadId');
    
    if (!threadId) {
      return new Response(
        JSON.stringify({ error: 'threadId required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    const graphConfig = getGraph<TGraphData>(graphName);
    
    if (!graphConfig) {
      return new Response(
        JSON.stringify({ error: `Graph '${graphName}' not found` }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    const { messages, state } = await loadThreadHistory<TGraphData>(
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