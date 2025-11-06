import { z } from "zod";
import { StateGraph, END, START, Annotation, messagesStateReducer } from "@langchain/langgraph";
import { AIMessage, HumanMessage, type BaseMessage } from "@langchain/core/messages";
import { createAgent } from "langchain";
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
  agentOutputSchema,
  type BrainstormTopic,
  type Brainstorm,
  type AgentStateType,
} from '../agentTypes';

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
        let existingData: T = {} as T;
        try {
            console.log(`attempting to read file: ${filePath}`)
            const fileContent = await readFile(filePath, 'utf-8');
            existingData = JSON.parse(fileContent);
        } catch (err) {
            console.log(`file not exist!`)
            // File doesn't exist or is invalid, start with empty object
        }

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
                2. Then output your response in one of these formats:
                   - structuredQuestion: For complex questions with intro, examples, and conclusion
                   - simpleQuestion: For clarifications or follow-ups (just content field)
                   - finishBrainstorming: When all information is collected
            </workflow>

            <ensure_understanding>
                Ensure you actually understand the answer in the user's own words.
                If unclear, use simpleQuestion to ask for clarification.
            </ensure_understanding>

            <output_format_rules>
                IMPORTANT: Your response MUST be in one of these exact formats:

                For a structured question:
                {
                  "type": "structuredQuestion",
                  "intro": "Brief intro to the question",
                  "examples": ["Example 1", "Example 2", "Example 3"],
                  "conclusion": "Restate what you're asking for"
                }

                For a simple question:
                {
                  "type": "simpleQuestion",
                  "content": "Your question here"
                }

                For finishing:
                {
                  "type": "finishBrainstorming",
                  "finishBrainstorming": true
                }

                You MUST output valid JSON in one of these formats. NO other text.
            </output_format_rules>
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
      });

      const updatedState = await agent.invoke(state as any, config);
      const aiResponse = updatedState.messages.at(-1);

      // The response is already structured thanks to withStructuredOutput
      const structuredResult = aiResponse?.content || aiResponse?.additional_kwargs?.tool_calls?.[0]?.function?.arguments;

      console.log('Structured result:', JSON.stringify(structuredResult, null, 2));

      const aiMessage = new AIMessage({
          content: JSON.stringify(structuredResult, null, 2),
          response_metadata: structuredResult,
      });

      return {
          messages: [...(state.messages || []), aiMessage]
      };
    } catch (error) {
      console.error('==========================================');
      console.error('BRAINSTORM AGENT ERROR - FAILING LOUDLY:');
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