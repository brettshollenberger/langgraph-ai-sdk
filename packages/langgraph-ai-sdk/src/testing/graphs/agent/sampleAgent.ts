import { z } from "zod";
import { StateGraph, END, START } from "@langchain/langgraph";
import { type BaseMessage } from "@langchain/core/messages";
import { createAgent, createMiddleware } from "langchain";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { getLLM } from '../../llm/llm';
import { tool } from "@langchain/core/tools";
import { toJSON, renderPrompt, chatHistoryPrompt, structuredOutputPrompt } from '../../prompts';
import { lastHumanMessage, lastAIMessage } from '../../../message';
import { writeFile, readFile } from 'fs/promises';
import { NodeMiddleware } from "../../node";
import {
  brainstormTopics,
  BrainstormStateAnnotation,
  questionSchema,
  type BrainstormTopic,
  type Brainstorm,
  type UserContext,
} from './types';
import { toStructuredMessage } from "../../../toStructuredMessage";

async function wipeJSON(filePath: string = './brainstorm-answers.json'): Promise<void> {
    try {
        await writeFile(filePath, '{}', 'utf-8');
    } catch (error) {
        console.error('Error wiping JSON file:', error);
        throw error;
    }
}

async function readAnswersFromJSON<T extends Record<string, any>>(
    filePath: string = './brainstorm-answers.json'
): Promise<T> {
    try {
        const fileContent = await readFile(filePath, 'utf-8');
        return JSON.parse(fileContent);
    } catch (err) {
        // File doesn't exist or is invalid, start with empty object
        return {} as T;
    }
}
/**
 * Helper function to write answers to a JSON file by key
 * Merges new data with existing data in the file
 * @param data - Object containing the answers keyed by topic
 * @param filePath - Path to the JSON file (defaults to ./brainstorm-answers.json)
 */
async function writeAnswersToJSON<T extends Record<string, any>>(
    data: T,
    filePath: string = './brainstorm-answers.json'
): Promise<void> {
    try {
        // Read existing data if file exists
        let existingData: T = await readAnswersFromJSON(filePath);

        // Merge new data with existing data
        const mergedData = { ...existingData, ...data };

        // Write to file with pretty formatting
        await writeFile(filePath, JSON.stringify(mergedData, null, 2), 'utf-8');
    } catch (error) {
        console.error('Error writing answers to JSON:', error);
        throw error;
    }
}

// Topic descriptions for the brainstorm agent
const TopicDescriptions: Record<BrainstormTopic, string> = {
    idea: `The core business idea. What does the business do? What makes them different?`,
    audience: `The target audience. What are their pain points? What are their goals?`,
    solution: `How does the user's business solve the audience's pain points, or help them reach their goals?`,
    socialProof: `Social proof or testimonials to include on the landing page. Remember, anything can be social proof: the user's background, experience, beliefs, founder story, etc.`,
    lookAndFeel: `The look and feel of the landing page.`,
}

type BrainstormGraphState = {
    messages: BaseMessage[];
    brainstorm: Brainstorm;
    remainingTopics: BrainstormTopic[];
    userContext: UserContext;
}

const sortedTopics = (topics: BrainstormTopic[]) => {
    return (topics || []).sort((a, b) => brainstormTopics.indexOf(a) - brainstormTopics.indexOf(b));
}

const remainingTopics = (topics: BrainstormTopic[]) => {
    return sortedTopics(topics || []).map(topic => `${topic}: ${TopicDescriptions[topic]}`).join("\n\n");
}

const collectedData = (state: BrainstormGraphState): Brainstorm => {
    return Object.entries(state.brainstorm || {}).filter(([_, value]) => value !== undefined && value !== "") as Brainstorm;
}

const getPrompt = async (state: BrainstormGraphState, config?: LangGraphRunnableConfig) => {
    const message = lastHumanMessage(state);
    if (!message) {
        throw new Error("No human message found");
    }

    const chatHistory = await chatHistoryPrompt({ messages: state.messages });
    const hasUserContext = state.userContext && Object.keys(state.userContext).length > 0;

    return renderPrompt(
        `
            <role>
                You are a highly paid marketing consultant and strategist who specializes in helping businesses develop
                HIGHLY PERSUASIVE marketing copy for their landing pages to differentiate their business ideas.
            </role>

            <rules>
                1. You MUST understand the user's business idea and audience. You are good natured, but critical of bad ideas. You MUST help the user find a GREAT angle.
                2. You have a reputation to uphold. You won't accept a bad business idea, but will help the user find a better angle.
                3. If the user is struggling, you can find creative angles to answer a question.
                4. You do not save an answer unless the user has given you a GREAT response. Continue refining UNTIL the user has given you a GREAT response in their own words.
                ${hasUserContext ? '5. IMPORTANT: Tailor your questions and feedback based on the user context provided below.' : ''}
            </rules>

            <task>
                Help the user brainstorm marketing copy for their landing page.
                Guide them through each question until you have enough context to generate effective marketing copy.
            </task>

            ${hasUserContext ? `<user_context>
                ${toJSON({ values: state.userContext })}
            </user_context>` : ''}

            <collected_data>
                ${toJSON({ values: collectedData(state) })}
            </collected_data>

            ${chatHistory}

            <remaining_topics>
                ${remainingTopics(state.remainingTopics)}
            </remaining_topics>

            <users_last_message>
                ${message?.content}
            </users_last_message>

            <workflow>
                1. If the user has answered any topics with a GREAT response, call the save_answers tool
                2. If they haven't, continue helping them refine their answer until they give you a GREAT response.
                3. Then, if:
                   - The user has answered ALL topics, generate a marketingTemplate with compelling landing page copy
                   - OTHERWISE, ask the next question, following the output_format_rules
            </workflow>

            <important>
                Do not miss anything important the user said! Any important
                business context they give you should be saved to the answers.
            </important>

            <ensure_understanding>
                Ensure you actually understand the answer in the user's own words.
                If unclear, use simpleQuestion to ask for clarification.
            </ensure_understanding>

            <output_format_rules>
                IMPORTANT: Your response MUST be in one of these exact formats:

                To ask a question:
                {
                  "type": "question",
                  "text": "Brief intro to the question",
                  "examples": ["Example 1", "Example 2", "Example 3"], // Optional
                  "conclusion": "Restate what you're asking for" // Optional
                }

                When the user has answered ALL brainstorming topics, generate marketing copy:
                {
                  "type": "marketingTemplate",
                  "headline": "Compelling, benefit-focused headline",
                  "subheadline": "Supporting detail that expands the promise", // Optional
                  "valueProposition": "Clear unique value statement",
                  "bulletPoints": ["Benefit 1", "Benefit 2", "Benefit 3"], // Optional, 3-5 items
                  "callToAction": "Strong action-oriented CTA",
                  "tone": "professional|friendly|urgent|authoritative|playful",
                  "socialProofSnippet": "Brief testimonial or proof element" // Optional
                }

                You MUST output valid JSON in one of these formats. NO other text.
            </output_format_rules>

            Before you output, ensure you write a long, meandering text premable so we
            can test our output parsing.

            ${await structuredOutputPrompt({ schema: questionSchema })}
        `
    );
}

// ===== TOOLS =====

const SaveAnswersTool = (state: BrainstormGraphState, config?: LangGraphRunnableConfig) => {
    const saveAnswersInputSchema = z.object({
        answers: z.array(z.object({
            topic: z.enum(brainstormTopics),
            answer: z.string()
        }))
    });

    type SaveAnswersInput = z.infer<typeof saveAnswersInputSchema>;

    async function saveAnswers(args?: SaveAnswersInput): Promise<{ success: boolean }> {
        const updates: Partial<Brainstorm> = args?.answers?.reduce((acc, { topic, answer }) => {
            if (!topic || !answer) {
                return acc;
            }
            acc[topic] = answer;
            return acc;
        }, {} as Record<BrainstormTopic, string>) || {}

        await writeAnswersToJSON(updates);

        return { success: true };
    }

    return tool(saveAnswers, {
        name: "save_answers",
        description: `
            Save answers to the brainstorming session. 
            Call this when the user has answered one or more of the remaining topics.
            IMPORTANT: When saving answers, save AS MUCH context as possible. We need a LOT of high quality content IN THE USER'S OWN WORDS to generate effective marketing copy.
        `,
        schema: saveAnswersInputSchema,
    });
}

const responseSchema = z.object({
    messages: z.array(z.object({
        role: z.string(),
        content: z.string()
    })),
    structuredResponse: z.object({
        type: z.string(),
        text: z.string(),
        examples: z.array(z.string()).optional(),
        conclusion: z.string().optional()
    })
});

const dynamicPromptMiddleware = createMiddleware({
    name: "DynamicPromptMiddleware",
    stateSchema: z.object({
        messages: z.array(z.any()),
        brainstorm: z.record(z.string()).optional(),
        remainingTopics: z.array(z.string()).optional(),
        userContext: z.record(z.string()).optional()
    }).passthrough(),
    wrapModelCall: async (request, handler) => {
        const state = request.state;
        const systemPrompt = await getPrompt(state as any, request.runtime);

        const rawResponse =await handler({
            ...request,
            systemPrompt,
        });
        const structuredResponse = await toStructuredMessage(rawResponse)
        debugger;
        return structuredResponse;
    },
})

/**
 * Node that asks a question to the user during brainstorming mode
 */
export const brainstormAgent = async (
    state: BrainstormGraphState,
    config?: LangGraphRunnableConfig
  ): Promise<Partial<BrainstormGraphState>> => {
    try {
      // Only use real tools that do something (save_answers)
      const tools = [SaveAnswersTool(state, config)];

      // Use structured output for the response format
      const llm = getLLM()
        .withConfig({ tags: ['notify'] })

      const systemPrompt = await getPrompt(state as any, config);
      const agent = await createAgent({
          model: llm,
          tools,
          middleware: [dynamicPromptMiddleware],
        //   responseFormat: agentOutputSchema,
      });

      const updatedState = await agent.invoke(state as any, config);
      const agentResponse = lastAIMessage(updatedState);
      const structuredResult = await toStructuredMessage(agentResponse);

      if (!agentResponse) {
        throw new Error("Agent response must be an AIMessage");
      }

      const answers = await readAnswersFromJSON<Brainstorm>();
      const questionsAnswered = Object.keys(answers);
      const remainingTopics = state.remainingTopics.filter(topic => !questionsAnswered.includes(topic));

      return {
          messages: [structuredResult],
          remainingTopics,
      };
    } catch (error) {
      console.error('==========================================');
      console.error('BRAINSTORM AGENT ERROR:');
      console.error('==========================================');
      console.error('Error details:', error);
      console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
      console.error('State:', JSON.stringify(state, null, 2));
      console.error('==========================================');
      throw error; // Re-throw to ensure it propagates
    }
}


/**
 * Simple test graph for the new brainstorm agent
 * Usage: Load this in LangGraph Studio to test the agent
 */
export function createSampleAgent(checkpointer?: any, graphName: string = 'sample') {
  return new StateGraph(BrainstormStateAnnotation)
      .addNode("agent", NodeMiddleware.use({}, brainstormAgent))
      .addEdge(START, "agent")
      .addEdge("agent", END)
      .compile({ checkpointer, name: graphName });
}