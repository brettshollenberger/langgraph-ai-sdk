import { initializeLanggraph, streamLanggraph, fetchLanggraphHistory } from 'langgraph-ai-sdk';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { createSampleAgent, agentOutputSchema, type AgentLanggraphData } from 'langgraph-ai-sdk/testing';
import pkg from 'pg';

const { Pool } = pkg;
const connectionString = process.env.DATABASE_URL || 'postgresql://localhost/langgraph_backend_test';
const pool = new Pool({
  connectionString
});
initializeLanggraph({ pool });
const checkpointer = new PostgresSaver(pool);

// Create and register the agent graph
export const agentGraph = createSampleAgent(checkpointer, 'agent');

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
  const messages = body.messages;
  const threadId = body.threadId;
  const state = body.state;

  return streamLanggraph<AgentLanggraphData>({
    graph: agentGraph,
    messageSchema: agentOutputSchema,
    messages,
    threadId,
    state
  });
});

export const GET = authMiddleware((req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const threadId = url.searchParams.get('threadId');

  return fetchLanggraphHistory<AgentLanggraphData>({
    graph: agentGraph,
    messageSchema: agentOutputSchema,
    threadId
  });
});
