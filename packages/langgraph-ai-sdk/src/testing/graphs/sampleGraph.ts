import { z } from 'zod';
import { StateGraph, START, END } from '@langchain/langgraph';
import { LangGraphRunnableConfig } from '@langchain/langgraph';
import { sampleMessageSchema, type SampleMessageType, type SampleStateType, SampleGraphAnnotation } from './types';
import { StructuredOutputParser } from '@langchain/core/output_parsers';
import { AIMessage } from '@langchain/core/messages';
import { getLLM } from '../llm/llm';
import { NodeMiddleware } from '../node';

/**
 * Node that generates a project name based on the user's message
 * Only runs if projectName is not already set in state
 */
export const nameProjectNode = NodeMiddleware.use({
    notifications: {
        taskName: 'Name Project',
    }
}, async (state: SampleStateType, config: LangGraphRunnableConfig) => {
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
});

/**
 * Node that generates a response to the user's message
 * Uses the messageSchema to return either simple or structured messages
 * Tagged with 'notify' for streaming support
 */
export const responseNode = NodeMiddleware.use({
    notifications: {
        taskName: 'Generate Response',
    }
}, async (state: SampleStateType, config: LangGraphRunnableConfig) => {
  const userPrompt = state.messages[state.messages.length - 1];
  if (!userPrompt) throw new Error('Need user prompt');

  const projectContext = state.projectName
    ? `Project: "${state.projectName}"\n\n`
    : '';

  const parser = StructuredOutputParser.fromZodSchema(sampleMessageSchema);
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
      Choose whichever output format you think is most appropriate, given
      the answer you are about to provide.
    </choose>

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

  let structured: SampleMessageType;
  try {
    structured = sampleMessageSchema.parse(JSON.parse(content));
  } catch (e) {
    structured = {
      content: 'I apologize, I had trouble formatting my response properly.',
    };
  }

  const aiMessage = new AIMessage({
    content: content,
    response_metadata: structured,
  });

  return {
    messages: [aiMessage],
  };
});

/**
 * Creates a compiled sample graph with the given checkpointer
 *
 * Graph flow: START → nameProjectNode → responseNode → END
 *
 * @param checkpointer - Optional checkpointer for state persistence
 * @param graphName - Name to identify the graph (default: 'sample')
 * @returns Compiled LangGraph
 */
export function createSampleGraph(checkpointer?: any, graphName: string = 'sample') {
  return new StateGraph(SampleGraphAnnotation)
    .addNode('nameProjectNode', nameProjectNode)
    .addNode('responseNode', responseNode)
    .addEdge(START, 'nameProjectNode')
    .addEdge('nameProjectNode', 'responseNode')
    .addEdge('responseNode', END)
    .compile({ checkpointer, name: graphName });
}
