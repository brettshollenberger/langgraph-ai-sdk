import { z } from 'zod';
import { StateGraph, Annotation, START, END, messagesStateReducer } from '@langchain/langgraph';
import { type BaseMessage } from '@langchain/core/messages';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatOllama } from '@langchain/ollama';
import { messageMetadataSchema, type MessageMetadata } from '../types.ts';
import { StructuredOutputParser } from '@langchain/core/output_parsers';
import { AIMessage } from '@langchain/core/messages';
import { checkpointer, registerGraph, streamLangGraph, fetchLangGraphHistory } from '../core/api.js';

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

export type StateType = {
  messages: BaseMessage[];
  projectName?: string;
};

// const llm = new ChatOllama({
//   model: 'gpt-oss:20b',
//   temperature: 0,
// });

const llm = new ChatAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  model: 'claude-haiku-4-5',
  temperature: 0,
});

const nameProjectNode = async (state: StateType) => {
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
  try {
    projectName = (await llm.withStructuredOutput(schema).invoke(prompt)).projectName;
  } catch (e) {
    console.error(`failed to name project: ${e}`);
    return {};
  }

  return { projectName };
};

const responseNode = async (state: StateType) => {
  const userPrompt = state.messages[state.messages.length - 1];
  if (!userPrompt) throw new Error('Need user prompt');

  const projectContext = state.projectName 
    ? `Project: "${state.projectName}"\n\n` 
    : '';

  const parser = StructuredOutputParser.fromZodSchema(messageMetadataSchema);
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

  const rawMessage = await llm.withConfig({ tags: ['notify'] }).invoke(prompt);
  
  let content = typeof rawMessage.content === 'string' 
    ? rawMessage.content 
    : '';
  
  content = content.replace(/```json/g, '').replace(/```/g, '').trim();
  
  let structured: MessageMetadata;
  try {
    structured = messageMetadataSchema.parse(JSON.parse(content));
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
  .addNode('nameProjectNode', nameProjectNode)
  .addNode('responseNode', responseNode)
  .addEdge(START, 'nameProjectNode')
  .addEdge('nameProjectNode', 'responseNode')
  .addEdge('responseNode', END)
  .compile({ checkpointer });

registerGraph('default', {
  graph,
  messageMetadataSchema,
});

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
  return streamLangGraph('default')(req);
});

export const GET = authMiddleware((req: Request): Promise<Response> => {
  return fetchLangGraphHistory('default')(req);
});
