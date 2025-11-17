import { AIMessage, AIMessageChunk } from '@langchain/core/messages';
import { RawJSONParser } from './rawJSONParser';
import { isAIMessage } from '@langchain/core/messages';

export async function toStructuredMessage<TSchema extends Record<string, any> = Record<string, any>>(
    result: AIMessage | AIMessageChunk
): Promise<AIMessage | null> {
  if (!result) { 
      throw new Error("Handler result must be an AIMessage or an object with messages and structuredResponse properties");
  }

  // If it's already an AIMessage, return it
  if (isAIMessage(result)) {
    if (typeof result.content === 'string' && result.content.match('```json')) {
      return parseStructuredChunk(result);
    }
    return result;
  }

  if (isToolCall(result)) {
    return result;
  }

  return await parseStructuredChunk<TSchema>(result);
}

export async function parseStructuredChunk<TSchema extends Record<string, any> = Record<string, any>>(
  result: AIMessage | AIMessageChunk
): Promise<AIMessage | null> {
  const parser = new RawJSONParser();
  const [success, parsed] = await parser.parse(result);
  
  // If we already have one, merge into the existing response_metadata
  if (isAIMessage(result)) {
    if (result.response_metadata) {
      result.response_metadata = {
        ...result.response_metadata,
        ...parsed,
      };
    }
    return result;
  }

  if (success && parsed) {
    const aiMessage = new AIMessage({
      content: JSON.stringify(parsed),
      response_metadata: parsed as TSchema,
    });
    return aiMessage;
  }
  
  return null;
}

const isToolCall = (message: AIMessageChunk): boolean => {
  if (!message.content || !message.content[0]) {
    return false;
  }
  let content = message.content[0];
  if (typeof content !== 'object' || !('type' in content)) {
    return false;
  }
  return content.type === "tool_use";
}