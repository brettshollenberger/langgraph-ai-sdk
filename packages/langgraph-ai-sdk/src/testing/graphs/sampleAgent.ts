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

    const [chatHistory, outputInstructions] = await Promise.all([
        chatHistoryPrompt({ messages: state.messages }),
        structuredOutputPrompt({ schema: agentOutputSchema })
    ])

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

            <decide_next_action>
                - If user's last message answered any of the remaining topics → call save_answers
                - If answer is off-topic/confused → provide clarification
                - If user asks for help → provide clarification
                - If no remaining topics → output finish_brainstorming
                - Otherwise → ask the user the next question, using the output format specified below
            </decide_next_action>

            <users_last_message>
                ${lastHumanMessage.content}
            </users_last_message>

            <workflow>
                1. Save any unsaved answers
                2. Decide next action based on user's last message
            </workflow>

            <ensure_understanding>
                Ensure you actually understand the answer to the question in the user's
                own words. If you don't for example, have them explaining what their solution
                is in their own words, then ask for clarification.
            </ensure_understanding>

            ${outputInstructions}
        `
    );
}

const SaveAnswersTool = (state: BrainstormGraphState, config?: LangGraphRunnableConfig): Promise<Tool> => {
    const description = `
        Tool for saving answers to the brainstorming session.

        CAPABILITIES:
        • Save multiple answers at once
    `;

    const saveAnswersInputSchema = z.object({
        answers: z.array(z.object({
            topic: z.enum(brainstormTopics),
            answer: z.string()
        }))
    });

    type SaveAnswersInput = z.infer<typeof saveAnswersInputSchema>;

    const SaveAnswersOutputSchema = z.object({
        success: z.boolean(),
    });

    type SaveAnswersOutput = z.infer<typeof SaveAnswersOutputSchema>;

    async function saveAnswers(args?: SaveAnswersInput): Promise<SaveAnswersOutput> {
        const updates: Partial<Brainstorm> = args?.answers?.reduce((acc, { topic, answer }) => {
            if (!topic || !answer) {
                return acc;
            }
            acc[topic] = answer;
            return acc;
        }, {} as Record<BrainstormTopic, string>) || {}

        // Write answers to JSON file
        await writeAnswersToJSON(updates);

        console.log('Saved answers:', updates);

        return {
            success: true
        };
    }
    
    return tool(saveAnswers, {
        name: "saveAnswers",
        description,
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
      const tools = await Promise.all([
          SaveAnswersTool
      ].map(tool => tool(state, config)));

      const llm = getLLM().withConfig({ tags: ['notify'] });
      const agent = await createAgent({
          model: llm,
          tools,
          systemPrompt: prompt,
      });
      const updatedState = await agent.invoke(state as any, config);
      let aiResponse = updatedState.messages.at(-1);
      let content = aiResponse?.content[0];

      const parser = StructuredOutputParser.fromZodSchema(agentOutputSchema);

      let textContent = content?.text as string;
      const jsonMatch = textContent.match(/```json\n([\s\S]*?)\n```/);
      if (jsonMatch) {
          textContent = jsonMatch[1];
      }

      const structuredResult = await parser.parse(textContent);
      console.log('Parsed structured result:', structuredResult)

      const aiMessage = new AIMessage({
          content: textContent,
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