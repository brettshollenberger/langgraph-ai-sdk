import { registerGraph, streamLanggraph, fetchLanggraphHistory } from 'langgraph-ai-sdk';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { createSampleAgent, questionSchema, type AgentLanggraphData } from 'langgraph-ai-sdk/testing';
import pkg from 'pg';

const { Pool } = pkg;
const connectionString = process.env.DATABASE_URL || 'postgresql://localhost/langgraph_backend_test';
const pool = new Pool({
  connectionString
});
const checkpointer = new PostgresSaver(pool);

// Create and register the agent graph
export const agentGraph = createSampleAgent(checkpointer, 'agent');
registerGraph<AgentLanggraphData>('agent', agentGraph);

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
  console.log(`hit the agent endpoint`)
  return streamLanggraph<AgentLanggraphData>({
    graphName: 'agent',
    messageSchema: questionSchema
  })(req);
});

export const GET = authMiddleware((req: Request): Promise<Response> => {
  return fetchLanggraphHistory<AgentLanggraphData>({
    graphName: 'agent',
    messageSchema: questionSchema
  })(req);
});
