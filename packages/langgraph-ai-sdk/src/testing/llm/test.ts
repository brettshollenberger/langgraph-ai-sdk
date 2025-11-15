import { FakeStreamingChatModel } from "@langchain/core/utils/testing";
import { AIMessage, AIMessageChunk } from "@langchain/core/messages";
import { type BaseChatModel } from "@langchain/core/language_models/chat_models";
import { getNodeContext } from "../node/withContext";
import {
  type LLMAppConfig,
  type LocalConfig,
  type MockResponses,
  type ILLMManager,
  LLMNames,
} from "./types";

class StructuredOutputAwareFakeModel extends FakeStreamingChatModel {
  private useStructuredOutput = false;
  private structuredSchema: any = null;
  private boundTools: any[] = [];
  private includeRaw: boolean = false;
  private streamingChunks: any[] = [];

  // @ts-ignore
  override withStructuredOutput(schema: any, config?: any): this {
    this.useStructuredOutput = true;
    this.structuredSchema = schema;
    this.includeRaw = config?.includeRaw ?? false;

    // Don't convert to chunks yet - wait until invoke is called
    return this;
  }

  private convertResponsesToStructuredChunks(responses: any[]): any[] {
    if (!responses || responses.length === 0 || !this.useStructuredOutput) {
      return [];
    }

    // Flatten the response array to create multiple chunks per response
    const allChunks: any[] = [];

    for (const response of responses) {
      const content = typeof response === 'string'
        ? response
        : response.content || '';

      const stripped = content.replace(/```json\n?/g, '').replace(/```/g, '').trim();

      try {
        const parsed = JSON.parse(stripped);
        const jsonString = JSON.stringify(parsed);

        // Split the JSON string into chunks to simulate streaming
        // We'll use a chunk size that makes sense for streaming (e.g., 20 characters)
        const chunkSize = 20;
        const chunks: string[] = [];

        for (let i = 0; i < jsonString.length; i += chunkSize) {
          chunks.push(jsonString.substring(i, i + chunkSize));
        }

        // Create AIMessageChunk for each piece
        // First chunk includes the tool name, subsequent chunks only have args
        chunks.forEach((argsChunk, idx) => {
          const toolCallChunk: any = {
            args: argsChunk,
            id: 'extract-1',
            index: 0,
          };

          // Only include name in the first chunk
          if (idx === 0) {
            toolCallChunk.name = 'extract-structured_output';
          }

          const messageChunk = new AIMessageChunk({
            content: '',
            tool_call_chunks: [toolCallChunk],
            id: `msg-${idx}`,
          });

          if (this.includeRaw) {
            // For includeRaw, we need to aggregate all chunks and return at the end
            // For simplicity, we'll just add the chunks and handle aggregation separately
            allChunks.push({
              raw: messageChunk,
              parsed: idx === chunks.length - 1 ? parsed : undefined
            });
          } else {
            allChunks.push(messageChunk);
          }
        });

      } catch (e) {
        // Handle parse error - return empty message chunk
        const errorChunk = new AIMessageChunk({ content });

        if (this.includeRaw) {
          allChunks.push({
            raw: errorChunk,
            parsed: null
          });
        } else {
          allChunks.push(errorChunk);
        }
      }
    }

    return allChunks;
  }

  override bindTools(tools: any[], config?: any): any {
    const clone = Object.create(Object.getPrototypeOf(this));
    Object.assign(clone, this);
    clone.boundTools = tools;
    // When tools are bound, treat it like structured output for streaming
    // Check if any tool starts with 'extract-' which indicates structured output
    const hasExtractTool = tools.some(t => t.name?.startsWith('extract-'));
    if (hasExtractTool) {
      clone.useStructuredOutput = true;
      clone.structuredSchema = tools.find(t => t.name?.startsWith('extract-'))?.parameters;
    }
    return clone;
  }

  // Override _streamResponseChunks instead of stream() so parent class can handle event emission
  override async *_streamResponseChunks(
    messages: any,
    options?: any,
    runManager?: any
  ): AsyncGenerator<any> {
    if (this.useStructuredOutput) {
      // Convert responses to chunks with tool_call_chunks
      const originalResponses = this.responses || [];
      this.streamingChunks = this.convertResponsesToStructuredChunks(originalResponses);

      // Yield chunks in the format expected by parent class
      for (let i = 0; i < this.streamingChunks.length; i++) {
        const chunk = this.streamingChunks[i];
        const messageChunk = this.includeRaw ? chunk.raw : chunk;
        yield {
          message: messageChunk,
          chunk: messageChunk,
          // Include generation info with metadata that might include tags
          generation_info: options?.tags ? { metadata: { tags: options.tags } } : undefined,
        };
        await new Promise(resolve => setTimeout(resolve, 1));
      }
    } else {
      // Fall back to parent implementation
      yield* super._streamResponseChunks(messages, options, runManager);
    }
  }

  override async invoke(input: any, options?: any): Promise<any> {
    if (this.useStructuredOutput) {
      // Let the parent invoke() call our _streamResponseChunks() and aggregate
      // This ensures events are properly emitted
      const response = await super.invoke(input, options);

      // Extract parsed result from tool_calls
      if (response && response.tool_calls && response.tool_calls.length > 0) {
        const toolCall = response.tool_calls[0];
        if (!toolCall) {
          return response;
        }
        const parsed = toolCall.args;
        if (this.includeRaw) {
          return { raw: response, parsed };
        }
        return parsed;
      }

      return response;
    }

    const response = await super.invoke(input, options);
    return response;
  }
}

// Fake Config for testing
export const FakeConfig: LocalConfig = {
  provider: "fake",
  model: "Fake",
  modelCard: LLMNames.Fake,
  temperature: 0,
  maxTokens: 128_000,
}

// Test environment uses Fake for all skills
const testConfig = {
  planning: FakeConfig,
  writing: FakeConfig,
  coding: FakeConfig,
  reasoning: FakeConfig,
};

export const testLLMConfig: LLMAppConfig = {
  "free": {
    "fast": testConfig,
    "slow": testConfig,
  },
  "paid": {
    "fast": testConfig,
    "slow": testConfig,
  },
};

// Mock response manager - stores normalized (string) responses
class TestLLMManager implements ILLMManager {
    responses: { [graphName: string]: { [nodeName: string]: string[] } } = {};

    get(...args: Parameters<ILLMManager['get']>): any {
      const nodeContext = getNodeContext();
      const graphName = nodeContext?.graphName;
      const nodeName = nodeContext?.name;

      if (!graphName || !nodeName) {
        throw new Error("Graph name or node name is missing! Cannot get test LLM without proper context.");
      }

      const graphResponses = this.responses[graphName];
      if (!graphResponses || !graphResponses[nodeName]) {
        throw new Error("No responses configured for this graph/node combination.");
      }

      const responses = graphResponses[nodeName].map(responseStr => {
        return new AIMessage({ content: responseStr });
      });

      return new StructuredOutputAwareFakeModel({
        responses,
        sleep: 0,
      });
    }
}

const manager = new TestLLMManager();

/**
 * Convert a response value to a string format suitable for FakeListChatModel
 * - Objects are converted to ```json ... ``` format
 * - Strings are returned as-is
 */
function normalizeResponse(response: string | object): string {
  if (typeof response === 'string') {
    return response;
  }

  // Convert object to JSON and wrap in markdown code block
  const jsonString = JSON.stringify(response, null, 2);
  return `\`\`\`json\n${jsonString}\n\`\`\``;
}

/**
 * Configure mock responses for specific nodes in test environment
 * Organized by graph identifier (thread_id or checkpoint_ns) to avoid collisions
 *
 * Supports both string responses and object responses:
 * - Strings are used as-is
 * - Objects are automatically converted to ```json ... ``` format
 *
 * @example
 * configureResponses({
 *   "thread-123": {
 *     nameProjectNode: ["project-paris"],
 *     // Both formats work:
 *     responseNode: [{ intro: 'It just works', examples: ['ex1'], conclusion: 'Done' }]
 *     // Or: responseNode: ["```json { \"intro\": \"It just works\" }```"]
 *   },
 *   "thread-456": {
 *     nameProjectNode: ["project-london"],
 *     responseNode: [{ intro: 'Also works' }]
 *   }
 * })
 */
export function configureResponses(responses: MockResponses) {
    // Normalize all responses to string format
    const normalizedResponses: { [graphName: string]: { [nodeName: string]: string[] } } = {};

    for (const [graphName, graphResponses] of Object.entries(responses)) {
      normalizedResponses[graphName] = {};
      for (const [nodeName, nodeResponses] of Object.entries(graphResponses)) {
        normalizedResponses[graphName][nodeName] = nodeResponses.map(normalizeResponse);
      }
    }

    manager.responses = normalizedResponses;
}

/**
 * Reset all configured responses
 * Useful in afterEach hooks to clean up test state
 *
 * @example
 * afterEach(() => {
 *   resetLLMConfig();
 * });
 */
export function resetLLMConfig() {
    manager.responses = {};
}

/**
 * Get a test LLM instance (StructuredOutputAwareFakeModel) based on the current node context
 * Returns null if no responses are configured for the current graph/node combination,
 * allowing the main getLLM function to fall back to core LLM
 */
export function getTestLLM(...args: Parameters<ILLMManager['get']>): StructuredOutputAwareFakeModel {
    return manager.get(...args);
}

/**
 * Check if test responses are configured for a specific graph and node
 * Useful for conditional test logic
 */
export function hasConfiguredResponses(graphName: string, nodeName: string): boolean {
  return !!(manager.responses[graphName]?.[ nodeName]);
}
