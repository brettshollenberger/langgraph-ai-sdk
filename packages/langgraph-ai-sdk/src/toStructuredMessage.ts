import { AIMessage, AIMessageChunk, ContentBlock } from '@langchain/core/messages';
import { RawJSONParser } from './rawJSONParser';
import { isAIMessage } from '@langchain/core/messages';
import { parsePartialJson } from 'ai';

const isTextBlock = (block: ContentBlock): block is ContentBlock.Text => {
  return block.type === "text";
};

const isToolCallBlock = (block: ContentBlock): block is ContentBlock.Tools.ToolCall => {
  return block.type === "tool_call";
};

const isToolCallChunkBlock = (block: ContentBlock): block is ContentBlock.Tools.ToolCallChunk => {
  return block.type === "tool_call_chunk";
};

const isImageBlock = (block: ContentBlock): block is ContentBlock.Multimodal.Image => {
  return block.type === "image";
};

const isReasoningBlock = (block: ContentBlock): block is ContentBlock.Reasoning => {
  return block.type === "reasoning";
};

// Extend BaseContentBlock to make it compatible with AIMessageChunk
interface StructuredContentBlock<TSchema extends Record<string, any> = Record<string, any>> extends BaseContentBlock {
  readonly type: 'structured';
  index?: number;
  text: string;
  parsed: TSchema;
}

class StructuredMessageParser<TSchema extends Record<string, any> = Record<string, any>> {
  message: AIMessage | AIMessageChunk;

  constructor(message: AIMessage | AIMessageChunk) {
    this.message = message;
  }

  async parse(): Promise<AIMessage | AIMessageChunk> {
    // Return non-chunk messages as-is
    if (!AIMessageChunk.isInstance(this.message)) {
      return this.message;
    }

    // Handle empty or string content
    if (!this.message.content || !Array.isArray(this.message.content)) {
      return this.message;
    }

    // Parse each content block
    const parsedContent = await Promise.all(
      this.message.content.map(async (block: ContentBlock) => {
        return new ContentBlockParser<TSchema>(block).parse();
      })
    );

    // Create new AIMessageChunk with parsed content
    return new AIMessageChunk({
      content: parsedContent,
      id: this.message.id,
      tool_calls: this.message.tool_calls,
      tool_call_chunks: this.message.tool_call_chunks,
      invalid_tool_calls: this.message.invalid_tool_calls,
      usage_metadata: this.message.usage_metadata,
      response_metadata: this.message.response_metadata,
      additional_kwargs: this.message.additional_kwargs,
    });
  }
}

class ContentBlockParser<TSchema extends Record<string, any> = Record<string, any>> {
  block: ContentBlock;

  constructor(block: ContentBlock) {
    this.block = block;
  }

  async parse(): Promise<ContentBlock | StructuredContentBlock<TSchema>> {
    // Pass through non-text blocks unchanged
    if (isToolCallBlock(this.block) ||
        isToolCallChunkBlock(this.block) ||
        isReasoningBlock(this.block) ||
        isImageBlock(this.block)) {
      return this.block;
    }

    // Try to parse text blocks as structured content
    if (isTextBlock(this.block)) {
      const parser = new TextBlockParser();
      const [success, parsed] = await parser.parse(this.block);

      if (success && parsed) {
        return {
          type: 'structured' as const,
          index: this.block.index,
          text: this.block.text,
          parsed: parsed as TSchema,
          id: this.block.id,
        };
      }
    }

    // Return original block if parsing failed or not a text block
    return this.block;
  }
}

export async function toStructuredMessage<TSchema extends Record<string, any> = Record<string,any>>(
  result: AIMessage | AIMessageChunk
): Promise<AIMessage | AIMessageChunk | null> {
  return new StructuredMessageParser(result).parse();
}

export class TextBlockParser {
    messageBuffer: string = '';
    hasSeenJsonStart: boolean = false;
    hasSeenJsonEnd: boolean = false;

    async parse(block: ContentBlock.Text): Promise<[boolean, Record<string, any> | undefined]> {
        try {
            this.messageBuffer += block.text;

            if (this.messageBuffer.includes('```json')) {
                const indexOfJsonStart = this.messageBuffer.indexOf('```json');
                this.messageBuffer = this.messageBuffer.substring(indexOfJsonStart + '```json'.length);
                this.hasSeenJsonStart = true;
            }
            if (this.hasSeenJsonStart && this.messageBuffer.includes('```')) {
                this.messageBuffer = this.messageBuffer.replace(/```/g, '');
                this.hasSeenJsonEnd = true;
            }
            if (this.hasSeenJsonStart && this.hasSeenJsonEnd) {
                this.hasSeenJsonStart = false;
                this.hasSeenJsonEnd = false;
            }

            const parseResult = await parsePartialJson(this.messageBuffer);
            const parsed = parseResult.value;
            if (!parsed || typeof parsed !== 'object') return [false, undefined];

            return [true, parsed];
        } catch (e) {
            return [false, undefined];
        }
    }
}

// export async function parseStructuredChunk<TSchema extends Record<string, any> = Record<string, any>>(
//   result: AIMessage | AIMessageChunk
// ): Promise<AIMessage | null> {
//   const parser = new RawJSONParser();
//   const [success, parsed] = await parser.parse(result);
  
//   // If we already have one, merge into the existing response_metadata
//   if (isAIMessage(result) && !isChunk(result)) {
//     if (result.response_metadata) {
//       result.response_metadata = {
//         ...result.response_metadata,
//         ...parsed,
//       };
//     }
//     return result;
//   }

//   if (success && parsed) {
//     const aiMessage = new AIMessage({
//       content: JSON.stringify(parsed),
//       response_metadata: parsed as TSchema,
//     });
//     return aiMessage;
//   }
  
//   debugger;
//   return null;
// }

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

const isChunk = (message: AIMessage | AIMessageChunk): boolean => {
  if (Array.isArray(message.content)) return true;

  return 'tool_call_chunks' in message;
}

// export async function toStructuredMessage<TSchema extends Record<string, any> = Record<string, any>>(
//     result: AIMessage | AIMessageChunk
// ): Promise<AIMessage | null> {
//   if (!result) { 
//       throw new Error("Handler result must be an AIMessage or an object with messages and structuredResponse properties");
//   }

//   if (isToolCall(result)) {
//     console.log(`it's a tool call`)
//     return result;
//   }

//   // If it's already an AIMessage, return it
//   if (isAIMessage(result) && !isChunk(result)) {
//     console.log(`it's an AI message`)
//     if (typeof result.content === 'string' && result.content.match('```json')) {
//       return parseStructuredChunk(result);
//     }
//     return result;
//   }

//   // AIMessageChunk
//   console.log(`it's a CHONK`)
//   return await parseStructuredChunk<TSchema>(result);
// }

// If array of chunks, keep everything as chunk.
//
export async function parseStructuredChunk<TSchema extends Record<string, any> = Record<string, any>>(
  result: AIMessage | AIMessageChunk
): Promise<AIMessage | null> {
  const parser = new RawJSONParser();
  const [success, parsed] = await parser.parse(result);
  
  // If we already have one, merge into the existing response_metadata
  if (isAIMessage(result) && !isChunk(result)) {
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