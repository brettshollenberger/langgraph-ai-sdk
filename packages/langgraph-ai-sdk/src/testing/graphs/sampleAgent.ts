import { z } from "zod";
import { StateGraph, END, START, Annotation, messagesStateReducer } from "@langchain/langgraph";
import { AIMessage, HumanMessage, type BaseMessage } from "@langchain/core/messages";
import { createAgent, providerStrategy } from "langchain";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { getLLM } from '../llm/llm';
import { tool, Tool } from "@langchain/core/tools";
import { StructuredOutputParser } from "@langchain/core/output_parsers";
import { toJSON, renderPrompt, chatHistoryPrompt, structuredOutputPrompt, isHumanMessage } from '../prompts';
import { writeFile, readFile } from 'fs/promises';
import { withContext } from "../node";
import { type LanggraphData } from '../../types';
import {
  brainstormTopics,
  BrainstormStateAnnotation,
  questionSchema,
  agentOutputSchema,
  type BrainstormTopic,
  type Brainstorm,
  type AgentStateType,
} from '../agentTypes';

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
        console.log(`file not exist!`)
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
}

const sortedTopics = (topics: BrainstormTopic[]) => {
    return topics.sort((a, b) => brainstormTopics.indexOf(a) - brainstormTopics.indexOf(b));
}

const remainingTopics = (topics: BrainstormTopic[]) => {
    return sortedTopics(topics).map(topic => `${topic}: ${TopicDescriptions[topic]}`).join("\n\n");
}

const collectedData = (state: BrainstormGraphState): Brainstorm => {
    return Object.entries(state.brainstorm).filter(([_, value]) => value !== undefined && value !== "") as Brainstorm;
}

const getPrompt = async (state: BrainstormGraphState, config?: LangGraphRunnableConfig) => {
    const lastHumanMessage = state.messages.filter(isHumanMessage).at(-1);
    if (!lastHumanMessage) {
        throw new Error("No human message found");
    }

    const chatHistory = await chatHistoryPrompt({ messages: state.messages });

    return renderPrompt(
        `
            <role>
                You are an expert marketer and strategist who specializes in helping businesses develop
                HIGHLY PERSUASIVE marketing copy for their landing pages to differentiate their business ideas.
            </role>

            <task>
                Help the user brainstorm marketing copy for their landing page.
                Guide them through each question until you have enough context to generate effective marketing copy.
            </task>

            <collected_data>
                ${toJSON({ values: collectedData(state) })}
            </collected_data>

            ${chatHistory}

            <remaining_topics>
                ${remainingTopics(state.remainingTopics)}
            </remaining_topics>

            <users_last_message>
                ${lastHumanMessage.content}
            </users_last_message>

            <workflow>
                1. If the user has answered any topics, call the save_answers tool
                2. Then, if:
                   - The user has answered all topics, output finishBrainstorming
                   - OTHERWISE, ask a question, following the output_format_rules
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

                When the user has finished brainstorming, output:
                {
                  "type": "finishBrainstorming",
                  "finishBrainstorming": true
                }

                You MUST output valid JSON in one of these formats. NO other text.
            </output_format_rules>

            ${await structuredOutputPrompt({ schema: questionSchema })}
        `
    );
}

// ===== TOOLS =====

const SaveAnswersTool = (state: BrainstormGraphState, config?: LangGraphRunnableConfig): Tool => {
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

        await wipeJSON('./brainstorm-answers.json');
        await writeAnswersToJSON(updates);
        console.log('Saved answers:', updates);

        return { success: true };
    }

    return tool(saveAnswers, {
        name: "save_answers",
        description: "Save answers to the brainstorming session. Call this when the user has answered one or more of the remaining topics.",
        schema: saveAnswersInputSchema,
    });
}

/**
 * Node that asks a question to the user during brainstorming mode
 */
export const brainstormAgent = async (
    state: BrainstormGraphState,
    config?: LangGraphRunnableConfig
  ): Promise<Partial<BrainstormGraphState>> => {
    try {
      const prompt = await getPrompt(state, config)

      // Only use real tools that do something (save_answers)
      const tools = [SaveAnswersTool(state, config)];

      // Use structured output for the response format
      const llm = getLLM()
        .withConfig({ tags: ['notify'] })

      const agent = await createAgent({
          model: llm,
          tools,
          systemPrompt: prompt,
          responseFormat: questionSchema,
      });

      const updatedState = await agent.invoke(state as any, config);
      const structuredResponse = updatedState.structuredResponse

      const aiMessage = new AIMessage({
          content: JSON.stringify(structuredResponse, null, 2),
          response_metadata: structuredResponse,
      });
      const answers = await readAnswersFromJSON<Brainstorm>();
      const questionsAnswered = Object.keys(answers);
      const remainingTopics = state.remainingTopics.filter(topic => !questionsAnswered.includes(topic));

      return {
          messages: [...(state.messages || []), aiMessage],
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
      .addNode("agent", withContext(brainstormAgent, {}))
      .addEdge(START, "agent")
      .addEdge("agent", END)
      .compile({ checkpointer, name: graphName });
}