import { z } from 'zod';
import { StateGraph, START, END } from '@langchain/langgraph';
import { LangGraphRunnableConfig } from '@langchain/langgraph';
import { type StateType, type MyLanggraphData, GraphAnnotation } from '../types.ts';
import { AIMessage } from '@langchain/core/messages';
import { registerGraph, streamLanggraph, fetchLanggraphHistory } from 'langgraph-ai-sdk';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { getLLM, withContext } from 'langgraph-ai-sdk/testing';
import pkg from 'pg';

const { Pool } = pkg;
const connectionString = process.env.DATABASE_URL || 'postgresql://localhost/langgraph_backend_test';
const pool = new Pool({
  connectionString
});
const checkpointer = new PostgresSaver(pool);

const nameProjectNode = async (state: StateType, config: LangGraphRunnableConfig) => {
  if (state.projectName) {
    return {};
  }

  const userMessage = state.messages.find(m => m._getType() === 'human');
  if (!userMessage) return {};

  const prompt = `Based on this user message, generate a short, catchy project name (2-4 words max):

"${userMessage.content}"

Return ONLY the project name, nothing else.`;

  const schema = z.object({
    projectName: z.string().describe('Project name'),
  });

  let projectName;
  const llm = getLLM();
  try {
    projectName = (await llm.withStructuredOutput(schema).invoke(prompt)).projectName;
  } catch (e) {
    console.error(`failed to name project: ${e}`);
    return {};
  }

  return { projectName };
};

const responseNode = async (state: StateType, config: LangGraphRunnableConfig) => {
  const userPrompt = state.messages[state.messages.length - 1];
  if (!userPrompt) throw new Error('Need user prompt');

  const projectContext = state.projectName 
    ? `Project: "${state.projectName}"\n\n` 
    : '';

  const prompt = `${projectContext}
    Answer the user's question in a clear, conversational manner.

    <message-history>
      ${state.messages.map((m) => {
        return `<role>${m.getType()}</role><content>${m.content}</content>`
      }).join('\n')}
    </message-history>

    Question: ${userPrompt.content}
  `;

  const llm = getLLM();
  const rawMessage = await llm.withConfig({ tags: ['notify'] }).invoke(prompt);
  
  const content = typeof rawMessage.content === 'string' 
    ? rawMessage.content 
    : '';

  const aiMessage = new AIMessage({
    content: content,
  });

  return {
    messages: [aiMessage],
  };
};

export const graph = new StateGraph(GraphAnnotation)
  .addNode('nameProjectNode', withContext(nameProjectNode))
  .addNode('responseNode', withContext(responseNode))
  .addEdge(START, 'nameProjectNode')
  .addEdge('nameProjectNode', 'responseNode')
  .addEdge('responseNode', END)
  .compile({ checkpointer, name: 'text' });

registerGraph<MyLanggraphData>('text', graph);

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
  console.log(`running text endpoint`)
  console.log(`running text endpoint`)
  console.log(`running text endpoint`)
  return streamLanggraph<MyLanggraphData>({ 
    graphName: 'text'
  })(req);
});

export const GET = authMiddleware((req: Request): Promise<Response> => {
  return fetchLanggraphHistory<MyLanggraphData>({ 
    graphName: 'text'
  })(req);
});
