import { AIMessage, AIMessageChunk } from "@langchain/core/messages";
import { parsePartialJson } from "ai";

//#region src/toStructuredMessage.ts
const isTextBlock = (block) => {
	return block.type === "text";
};
const isToolCallBlock = (block) => {
	return block.type === "tool_call";
};
const isToolCallChunkBlock = (block) => {
	return block.type === "tool_call_chunk";
};
const isImageBlock = (block) => {
	return block.type === "image";
};
const isReasoningBlock = (block) => {
	return block.type === "reasoning";
};
var StructuredMessageParser = class {
	message;
	constructor(message) {
		this.message = message;
	}
	async parseAIMessage() {
		if (!this.message.content || typeof this.message.content !== "string") return this.message;
		const parser = new TextBlockParser();
		parser.append(this.message.content);
		const [success, parsed] = await parser.tryParseStructured();
		let blocks = [];
		if (success && parsed) blocks = [{
			type: "structured",
			index: 0,
			id: crypto.randomUUID(),
			sourceText: this.message.content,
			parsed
		}];
		else blocks = [{
			type: "text",
			index: 0,
			id: crypto.randomUUID(),
			sourceText: this.message.content
		}];
		return new AIMessage({
			...this.message,
			content: this.message.content,
			response_metadata: {
				...this.message.response_metadata,
				parsed_blocks: blocks
			}
		});
	}
	async parse() {
		if (AIMessage.isInstance(this.message)) return this.parseAIMessage();
		if (!this.message.content || !Array.isArray(this.message.content)) return this.message;
		const nativeContent = [];
		const parsedBlocks = [];
		for (let idx = 0; idx < this.message.content.length; idx++) {
			const block = this.message.content[idx];
			const result = await new ContentBlockParser(block).parse();
			if (result.type === "structured") {
				const structuredBlock = result;
				const parser = new TextBlockParser();
				parser.append(structuredBlock.text);
				const preamble = parser.getPreamble();
				if (preamble) parsedBlocks.push({
					type: "text",
					index: structuredBlock.index ?? idx,
					id: crypto.randomUUID(),
					sourceText: preamble
				});
				parsedBlocks.push({
					type: "structured",
					index: (structuredBlock.index ?? idx) + 1,
					id: crypto.randomUUID(),
					sourceText: structuredBlock.text,
					parsed: structuredBlock.parsed
				});
				nativeContent.push({
					type: "text",
					text: structuredBlock.text,
					index: structuredBlock.index,
					id: structuredBlock.id
				});
			} else {
				nativeContent.push(result);
				if (isTextBlock(result)) parsedBlocks.push({
					type: "text",
					index: result.index ?? idx,
					id: result.id || crypto.randomUUID(),
					sourceText: result.text
				});
				else if (isToolCallBlock(result)) parsedBlocks.push({
					type: "tool_call",
					index: result.index ?? idx,
					id: result.id,
					toolCallId: result.id,
					toolName: result.name,
					toolArgs: JSON.stringify(result.input)
				});
			}
		}
		if (AIMessageChunk.isInstance(this.message)) return new AIMessageChunk({
			content: nativeContent,
			id: this.message.id,
			tool_calls: this.message.tool_calls,
			tool_call_chunks: this.message.tool_call_chunks,
			invalid_tool_calls: this.message.invalid_tool_calls,
			usage_metadata: this.message.usage_metadata,
			response_metadata: {
				...this.message.response_metadata,
				parsed_blocks: parsedBlocks.length > 0 ? parsedBlocks : void 0
			},
			additional_kwargs: this.message.additional_kwargs
		});
		return new AIMessage({
			content: nativeContent,
			id: this.message.id,
			tool_calls: this.message.tool_calls,
			invalid_tool_calls: this.message.invalid_tool_calls,
			usage_metadata: this.message.usage_metadata,
			response_metadata: {
				...this.message.response_metadata,
				parsed_blocks: parsedBlocks.length > 0 ? parsedBlocks : void 0
			},
			additional_kwargs: this.message.additional_kwargs
		});
	}
};
var ContentBlockParser = class {
	block;
	constructor(block) {
		this.block = block;
	}
	async parse() {
		if (isToolCallBlock(this.block) || isToolCallChunkBlock(this.block) || isReasoningBlock(this.block) || isImageBlock(this.block)) return this.block;
		if (isTextBlock(this.block)) {
			const parser = new TextBlockParser();
			parser.append(this.block.text);
			const [success, parsed] = await parser.tryParseStructured();
			if (success && parsed) return {
				type: "structured",
				index: this.block.index,
				text: this.block.text,
				parsed,
				id: this.block.id
			};
		}
		return this.block;
	}
};
var TextBlockParser = class {
	messageBuffer = "";
	hasSeenJsonStart = false;
	hasSeenJsonEnd = false;
	index;
	id;
	textId;
	structuredId;
	hasEmittedPreamble = false;
	constructor(index = 0) {
		this.index = index;
		this.id = crypto.randomUUID();
		this.textId = crypto.randomUUID();
		this.structuredId = crypto.randomUUID();
	}
	append(text) {
		this.messageBuffer += text;
	}
	getContent() {
		return this.messageBuffer;
	}
	getPreamble() {
		const jsonStart = this.messageBuffer.indexOf("```json");
		if (jsonStart === -1 || jsonStart === 0) return void 0;
		return this.messageBuffer.substring(0, jsonStart).trim();
	}
	hasJsonStart() {
		return this.hasSeenJsonStart || this.messageBuffer.includes("```json");
	}
	async parse(block) {
		try {
			this.append(block.text);
			if (this.messageBuffer.includes("```json")) {
				const indexOfJsonStart = this.messageBuffer.indexOf("```json");
				this.messageBuffer = this.messageBuffer.substring(indexOfJsonStart + 7);
				this.hasSeenJsonStart = true;
			}
			if (this.hasSeenJsonStart && this.messageBuffer.includes("```")) {
				this.messageBuffer = this.messageBuffer.replace(/```/g, "");
				this.hasSeenJsonEnd = true;
			}
			if (this.hasSeenJsonStart && this.hasSeenJsonEnd) {
				this.hasSeenJsonStart = false;
				this.hasSeenJsonEnd = false;
			}
			const parsed = (await parsePartialJson(this.messageBuffer)).value;
			if (!parsed || typeof parsed !== "object") return [false, void 0];
			return [true, parsed];
		} catch (e) {
			return [false, void 0];
		}
	}
	async tryParseStructured() {
		try {
			let buffer = this.messageBuffer;
			if (buffer.includes("```json")) {
				const indexOfJsonStart = buffer.indexOf("```json");
				buffer = buffer.substring(indexOfJsonStart + 7);
			}
			if (buffer.includes("```")) buffer = buffer.replace(/```/g, "");
			const parsed = (await parsePartialJson(buffer)).value;
			if (!parsed || typeof parsed !== "object") return [false, void 0];
			if (Object.keys(parsed).length === 1 && "_type_" in parsed) return [false, void 0];
			return [true, parsed];
		} catch (e) {
			return [false, void 0];
		}
	}
};
async function toStructuredMessage(result) {
	return new StructuredMessageParser(result).parse();
}

//#endregion
export { toStructuredMessage as n, TextBlockParser as t };