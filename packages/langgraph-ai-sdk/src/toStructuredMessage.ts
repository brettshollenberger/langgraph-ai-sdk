import { AIMessage, AIMessageChunk } from '@langchain/core/messages';
import { RawJSONParser } from './rawJSONParser';

export async function toStructuredMessage<TSchema extends Record<string, any> = Record<string, any>>(
    result: AIMessage | AIMessageChunk
): Promise<AIMessage | null> {
  if (!result) { 
      throw new Error("Handler result must be an AIMessage or an object with messages and structuredResponse properties");
  }

  // If it's already an AIMessage, return it
  if (result instanceof AIMessage) {
    return result;
  }

  return await parseStructuredChunk<TSchema>(result);
}

export async function parseStructuredChunk<TSchema extends Record<string, any> = Record<string, any>>(
  result: AIMessageChunk
): Promise<AIMessage | null> {
  const parser = new RawJSONParser();
  const [success, parsed] = await parser.parse(result);
  
  if (success && parsed) {
    const aiMessage = new AIMessage({
      content: JSON.stringify(parsed),
      response_metadata: parsed as TSchema,
    });
    return aiMessage;
  }
  
  return null;
}