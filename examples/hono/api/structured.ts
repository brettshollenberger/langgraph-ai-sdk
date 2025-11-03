import { z } from 'zod';
import { StateGraph, START, END } from '@langchain/langgraph';
import { LangGraphRunnableConfig } from '@langchain/langgraph';
import { structuredMessageSchema, type StructuredMessage, type StateType, type MyLanggraphData, GraphAnnotation } from '../types.ts';
import { StructuredOutputParser } from '@langchain/core/output_parsers';
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

  const parser = StructuredOutputParser.fromZodSchema(structuredMessageSchema);
  const prompt = `${projectContext}
    Answer the user's question using this structure:
      1. An introduction (2-3 sentences)
      2. Three specific examples
      3. A conclusion (1-2 sentences)

    <message-history>
      ${state.messages.map((m) => {
        return `<role>${m.getType()}</role><content>${m.content}</content>`
      }).join('\n')}
    </message-history>

    Question: ${userPrompt.content}

    <output>
      ${parser.getFormatInstructions()}
    </output>
  `;

  const llm = getLLM();
  const rawMessage = await llm.withConfig({ tags: ['notify'] }).invoke(prompt);
  
  let content = typeof rawMessage.content === 'string' 
    ? rawMessage.content 
    : '';
  
  content = content.replace(/```json/g, '').replace(/```/g, '').trim();
  
  let structured: StructuredMessage;
  try {
    structured = structuredMessageSchema.parse(JSON.parse(content));
  } catch (e) {
    structured = {
      intro: 'I apologize, I had trouble formatting my response properly.',
      examples: ['Example 1', 'Example 2', 'Example 3'],
      conclusion: 'Please try asking your question again.',
    };
  }

  const aiMessage = new AIMessage({
    content: content,
    response_metadata: structured,
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
  .compile({ checkpointer, name: 'structured' });

registerGraph<MyLanggraphData>('structured', graph);

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
  console.log(`running structured endpoint`)
  console.log(`running structured endpoint`)
  console.log(`running structured endpoint`)
  return streamLanggraph<MyLanggraphData>({ 
    graphName: 'structured', 
    messageSchema: structuredMessageSchema 
  })(req);
});

export const GET = authMiddleware((req: Request): Promise<Response> => {
  return fetchLanggraphHistory<MyLanggraphData>({ 
    graphName: 'structured', 
    messageSchema: structuredMessageSchema 
  })(req);
});
