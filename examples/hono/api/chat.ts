import { z } from 'zod';
import { StateGraph, START, END, Annotation, messagesStateReducer } from '@langchain/langgraph';
import { LangGraphRunnableConfig } from '@langchain/langgraph';
import { messageSchema, type Message, type StateType, type LanggraphChatData } from '../types.ts';
import { StructuredOutputParser } from '@langchain/core/output_parsers';
import { AIMessage, type BaseMessage } from '@langchain/core/messages';

const GraphAnnotation = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    default: () => [],
    reducer: messagesStateReducer,
  }),
  projectName: Annotation<string | undefined>({
    default: () => undefined,
    reducer: (curr, next) => next ?? curr,
  }),
});
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
    projectName = (await llm.invoke(prompt))
  } catch (e) {
    console.log(`....error......`)
    console.error(`failed to name project: ${e}`);
    return {};
  }

  console.log(projectName);
  return { projectName };
};

const responseNode = async (state: StateType, config: LangGraphRunnableConfig) => {
  const userPrompt = state.messages[state.messages.length - 1];
  if (!userPrompt) throw new Error('Need user prompt');

  const projectContext = state.projectName 
    ? `Project: "${state.projectName}"\n\n` 
    : '';

  const parser = StructuredOutputParser.fromZodSchema(messageSchema);
  const prompt = `${projectContext}
    <task>
      Answer the user's question
    </task>

    <message-history>
      ${state.messages.map((m) => {
        return `<role>${m.getType()}</role><content>${m.content}</content>`
      }).join('\n')}
    </message-history>

    <question>
      ${userPrompt.content}
    </question>

    <choose>
      Based on the provided question, you may choose which output format to use, based on the options below:
    <choose>

    <output>
      ${parser.getFormatInstructions()}
    </output>
  `;

  const llm = getLLM();
  const rawMessage = await llm.withConfig({ tags: ['notify'] }).invoke(prompt);
  
  let plainContent = typeof rawMessage.content === 'string' 
    ? rawMessage.content 
    : '';
  
  plainContent = plainContent.replace(/```json/g, '').replace(/```/g, '').trim();
  
  console.log(`raw message: ${rawMessage}`)
  let structured: Message;
  try {
    structured = messageSchema.parse(JSON.parse(plainContent));
  } catch (e) {
    structured = {
      content: 'I apologize, I had trouble formatting my response properly.',
    };
  }

  const aiMessage = new AIMessage({
    content: plainContent,
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
  .compile({ checkpointer, name: 'default' });

registerGraph<LanggraphChatData>('default', graph);

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
  return streamLanggraph<LanggraphChatData>({ 
    graphName: 'default', 
    messageSchema: messageSchema 
  })(req);
});

export const GET = authMiddleware((req: Request): Promise<Response> => {
  return fetchLanggraphHistory<LanggraphChatData>({ 
    graphName: 'default', 
    messageSchema: messageSchema 
  })(req);
});
