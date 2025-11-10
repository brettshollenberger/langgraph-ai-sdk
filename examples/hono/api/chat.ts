import { structuredMessageSchema, type GraphLanggraphData } from '../types.ts';
import {
  streamLanggraph,
  fetchLanggraphHistory,
  initializeLanggraph
} from 'langgraph-ai-sdk';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { createSampleGraph } from 'langgraph-ai-sdk/testing';
import type { UIMessage } from 'ai';
import pkg from 'pg';

const { Pool } = pkg;
const connectionString = process.env.DATABASE_URL || 'postgresql://localhost/langgraph_backend_test';

// Create a single pool for both checkpointer and ops
const pool = new Pool({
  connectionString
});

// Initialize the library with the pool (for ops functions)
initializeLanggraph({ pool });

// Use the same pool for the checkpointer
const checkpointer = new PostgresSaver(pool);

// Create and register the default graph
export const graph = createSampleGraph(checkpointer, 'default');

function authMiddleware(handler: (req: Request) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    const authHeader = req.headers.get('Authorization');

    if (authHeader !== 'Bearer 12345') {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return handler(req);
  };
}

export const POST = authMiddleware(async (req: Request): Promise<Response> => {
  const body = await req.json();
  const uiMessages: UIMessage[] = body.messages;
  const state = body.state || {};
  const threadId: string = body.threadId;

  // Use the core function with parsed data - no double parsing!
  return streamLanggraph<GraphLanggraphData>({
    graph,
    messageSchema: structuredMessageSchema,
    messages: uiMessages,
    state,
    threadId,
  });
});

export const GET = authMiddleware(async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const threadId = url.searchParams.get('threadId') || '';

  // Use the core function with extracted threadId
  return fetchLanggraphHistory<GraphLanggraphData>({
    graph,
    messageSchema: structuredMessageSchema,
    threadId,
  });
});
