import { AIMessage, AIMessageChunk, BaseMessage, ContentBlock } from '@langchain/core/messages';
import { parsePartialJson } from 'ai';
export interface ParsedBlock {
  type: 'text' | 'tool_call' | 'structured' | 'reasoning' | 'image';
  index: number;
  id: string;
  sourceText?: string;
  parsed?: Record<string, any>;
  toolCallId?: string;
  toolName?: string;
  toolArgs?: string;
}

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
interface StructuredContentBlock<TSchema extends Record<string, any> = Record<string, any>> extends ContentBlock {
  readonly type: 'structured';
  index?: number;
  text: string;
  parsed: TSchema;
  [key: string]: unknown; // Required for BaseContentBlock compatibility
}
class StructuredMessageParser<TSchema extends Record<string, any> = Record<string, any>> {
  message: BaseMessage | AIMessage | AIMessageChunk;

  constructor(message: BaseMessage | AIMessage | AIMessageChunk) {
    this.message = message;
  }

  async parseAIMessage(): Promise<AIMessage> {
    if (!this.message.content || typeof this.message.content !== 'string') {
      return this.message as AIMessage;
    }

    const parser = new TextBlockParser();
    parser.append(this.message.content);
    const [success, parsed] = await parser.tryParseStructured();

    let blocks: ParsedBlock[] = [];
    if (success && parsed) {
      blocks = [{
        type: 'structured',
        index: 0,
        id: crypto.randomUUID(),
        sourceText: this.message.content,
        parsed: parsed,
      }]
    } else {
      blocks = [{
        type: 'text',
        index: 0,
        id: crypto.randomUUID(),
        sourceText: this.message.content,
      }]
    }

    return new AIMessage({
      ...this.message,
      content: this.message.content,
      response_metadata: {
        ...this.message.response_metadata,
        parsed_blocks: blocks,
      },
    })
  }

  async parse(): Promise<AIMessage | AIMessageChunk> {
    if (AIMessage.isInstance(this.message)) {
      return this.parseAIMessage();
    }

    if (!this.message.content || !Array.isArray(this.message.content)) {
      return this.message as AIMessage;
    }

    const nativeContent: ContentBlock[] = [];
    const parsedBlocks: ParsedBlock[] = [];

    for (let idx = 0; idx < this.message.content.length; idx++) {
      const block = this.message.content[idx];
      const result = await new ContentBlockParser<TSchema>(
        block as ContentBlock
      ).parse();
      
      if (result.type === 'structured') {
        const structuredBlock = result as StructuredContentBlock<TSchema>;
        
        const parser = new TextBlockParser();
        parser.append(structuredBlock.text);
        const preamble = parser.getPreamble();
        
        if (preamble) {
          parsedBlocks.push({
            type: 'text',
            index: structuredBlock.index ?? idx,
            id: crypto.randomUUID(),
            sourceText: preamble,
          });
        }
        
        parsedBlocks.push({
          type: 'structured',
          index: (structuredBlock.index ?? idx) + 1,
          id: crypto.randomUUID(),
          sourceText: structuredBlock.text,
          parsed: structuredBlock.parsed,
        });
        
        nativeContent.push({
          type: 'text',
          text: structuredBlock.text,
          index: structuredBlock.index,
          id: structuredBlock.id,
        } as ContentBlock.Text);
      } else {
        nativeContent.push(result);
        
        if (isTextBlock(result)) {
          parsedBlocks.push({
            type: 'text',
            index: result.index ?? idx,
            id: result.id || crypto.randomUUID(),
            sourceText: result.text,
          });
        } else if (isToolCallBlock(result)) {
          parsedBlocks.push({
            type: 'tool_call',
            index: result.index ?? idx,
            id: result.id,
            toolCallId: result.id,
            toolName: result.name,
            toolArgs: JSON.stringify(result.input),
          });
        }
      }
    }

    if (AIMessageChunk.isInstance(this.message)) {
      return new AIMessageChunk({
        content: nativeContent,
        id: this.message.id,
        tool_calls: this.message.tool_calls,
        tool_call_chunks: this.message.tool_call_chunks,
        invalid_tool_calls: this.message.invalid_tool_calls,
        usage_metadata: this.message.usage_metadata,
        response_metadata: {
          ...this.message.response_metadata,
          parsed_blocks: parsedBlocks.length > 0 ? parsedBlocks : undefined,
        },
        additional_kwargs: this.message.additional_kwargs,
      });
    }

    return new AIMessage({
      content: nativeContent,
      id: this.message.id,
      tool_calls: this.message.tool_calls,
      invalid_tool_calls: this.message.invalid_tool_calls,
      usage_metadata: this.message.usage_metadata,
      response_metadata: {
        ...this.message.response_metadata,
        parsed_blocks: parsedBlocks.length > 0 ? parsedBlocks : undefined,
      },
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
    if (isToolCallBlock(this.block) ||
        isToolCallChunkBlock(this.block) ||
        isReasoningBlock(this.block) ||
        isImageBlock(this.block)) {
      return this.block;
    }

    if (isTextBlock(this.block)) {
      const parser = new TextBlockParser();
      parser.append(this.block.text);
      const [success, parsed] = await parser.tryParseStructured();

      if (success && parsed) {
        return {
          type: 'structured' as const,
          index: this.block.index,
          text: this.block.text,
          parsed: parsed as TSchema,
          id: this.block.id,
        } satisfies StructuredContentBlock<TSchema>;
      }
    }

    return this.block;
  }
}
export class TextBlockParser {
    messageBuffer: string = '';
    hasSeenJsonStart: boolean = false;
    hasSeenJsonEnd: boolean = false;
    index: number;
    id: string;
    textId: string;
    structuredId: string;
    hasEmittedPreamble: boolean = false;

    constructor(index: number = 0) {
        this.index = index;
        this.id = crypto.randomUUID();
        this.textId = crypto.randomUUID();
        this.structuredId = crypto.randomUUID();
    }

    append(text: string): void {
        this.messageBuffer += text;
    }

    getContent(): string {
        return this.messageBuffer;
    }

    getPreamble(): string | undefined {
        const jsonStart = this.messageBuffer.indexOf('```json');
        if (jsonStart === -1 || jsonStart === 0) return undefined;
        return this.messageBuffer.substring(0, jsonStart).trim();
    }

    hasJsonStart(): boolean {
        return this.hasSeenJsonStart || this.messageBuffer.includes('```json');
    }

    async parse(block: ContentBlock.Text): Promise<[boolean, Record<string, any> | undefined]> {
        try {
            this.append(block.text);

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

    async tryParseStructured(): Promise<[boolean, Record<string, any> | undefined]> {
        try {
            let buffer = this.messageBuffer;

            if (buffer.includes('```json')) {
                const indexOfJsonStart = buffer.indexOf('```json');
                buffer = buffer.substring(indexOfJsonStart + '```json'.length);
            }
            
            if (buffer.includes('```')) {
                buffer = buffer.replace(/```/g, '');
            }

            const parseResult = await parsePartialJson(buffer);
            const parsed = parseResult.value;
            if (!parsed || typeof parsed !== 'object') return [false, undefined];

            const hasOnlyTypeField = Object.keys(parsed).length === 1 && '_type_' in parsed;
            if (hasOnlyTypeField) return [false, undefined];

            return [true, parsed];
        } catch (e) {
            return [false, undefined];
        }
    }
}

export async function toStructuredMessage<TSchema extends Record<string, any> = Record<string,any>>(
  result: BaseMessage | AIMessage | AIMessageChunk
): Promise<AIMessage | AIMessageChunk | null> {
  return new StructuredMessageParser<TSchema>(result).parse();
}