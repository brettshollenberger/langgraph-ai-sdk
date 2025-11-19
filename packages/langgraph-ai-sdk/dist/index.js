import { n as __export } from "./chunk-C3Lxiq5Q.js";
import { n as toStructuredMessage, t as TextBlockParser } from "./toStructuredMessage-CalTndMp.js";
import { AIMessage, AIMessageChunk, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { createUIMessageStream, createUIMessageStreamResponse, parsePartialJson } from "ai";
import { kebabCase } from "change-case";
import { drizzle } from "drizzle-orm/node-postgres";
import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

//#region src/stream.ts
const TOOL_CALL_REGEX = /^extract/;
const isUndefined = (value) => {
	return typeof value === "undefined";
};
const isNull = (value) => {
	return value === null;
};
const isString = (value) => {
	return typeof value === "string";
};
function getSchemaKeys(schema) {
	if (!schema) return [];
	if (Array.isArray(schema)) {
		const allKeys = /* @__PURE__ */ new Set();
		for (const s of schema) if (s && "shape" in s && s.shape) Object.keys(s.shape).forEach((key) => allKeys.add(key));
		return Array.from(allKeys);
	}
	if ("shape" in schema && schema.shape) return Object.keys(schema.shape);
	return [];
}
var Handler = class {
	writer;
	messageSchema;
	constructor(writer, messageSchema) {
		this.writer = writer;
		this.messageSchema = messageSchema;
	}
};
var OtherToolHandler = class extends Handler {
	currentToolName;
	toolCallStates = /* @__PURE__ */ new Map();
	async handle(chunk) {
		if (chunk[0] !== "messages" && !(Array.isArray(chunk[0]) && chunk[1] === "messages")) return;
		const [message, metadata] = Array.isArray(chunk[0]) ? chunk[2] : chunk[1];
		if (!metadata.tags?.includes("notify")) return;
		if (!message || !("tool_call_chunks" in message) || typeof message.tool_call_chunks !== "object" || !Array.isArray(message.tool_call_chunks)) return;
		for (const chunk$1 of message.tool_call_chunks) {
			if (isString(chunk$1.name)) this.currentToolName = chunk$1.name;
			if (this.currentToolName?.match(TOOL_CALL_REGEX)) continue;
			const toolName = this.currentToolName;
			if (!toolName) continue;
			let toolState = this.toolCallStates.get(toolName);
			const toolCallId = toolState?.id || crypto.randomUUID();
			if (!toolState) {
				toolState = {
					id: toolCallId,
					name: toolName,
					argsBuffer: ""
				};
				this.toolCallStates.set(toolName, toolState);
				this.writer.write({
					type: "tool-input-start",
					toolCallId,
					toolName
				});
			}
			toolState.argsBuffer += chunk$1.args || "";
			const parsedInput = (await parsePartialJson(toolState.argsBuffer)).value;
			if (parsedInput) this.writer.write({
				type: "tool-input-available",
				toolCallId,
				toolName: toolState.name,
				input: parsedInput
			});
		}
	}
	async handleToolEnd(toolName, chunk) {
		const toolState = this.toolCallStates.get(toolName);
		if (!toolState || toolState.completed) return;
		toolState.completed = true;
		const [type, data] = chunk;
		this.writer.write({
			type: "tool-output-available",
			toolCallId: toolState.id,
			output: data?.data?.data?.output
		});
	}
	async handleToolError(toolName, error) {
		const toolState = this.toolCallStates.get(toolName);
		if (!toolState || toolState.completed) return;
		toolState.completed = true;
		this.writer.write({
			type: "tool-output-error",
			toolCallId: toolState.id,
			errorText: String(error)
		});
	}
};
var ToolCallHandler = class extends Handler {
	handlers;
	constructor(writer, messageSchema) {
		super(writer, messageSchema);
		this.handlers = { other_tools: new OtherToolHandler(writer, messageSchema) };
	}
	async handle(chunk) {
		await this.handlers.other_tools.handle(chunk);
	}
	async handleToolEnd(toolName, chunk) {
		await this.handlers.other_tools.handleToolEnd(toolName, chunk);
	}
	async handleToolError(toolName, error) {
		await this.handlers.other_tools.handleToolError(toolName, error);
	}
};
var RawMessageHandler = class extends Handler {
	parsers = /* @__PURE__ */ new Map();
	constructor(writer, messageSchema) {
		super(writer, messageSchema);
	}
	isRawMessageChunk = (chunk) => {
		if (chunk[0] !== "messages" && !(Array.isArray(chunk[0]) && chunk[1] === "messages")) return false;
		return true;
	};
	getOrCreateParser(index) {
		if (!this.parsers.has(index)) this.parsers.set(index, new TextBlockParser(index));
		return this.parsers.get(index);
	}
	async handle(chunk) {
		if (!this.isRawMessageChunk(chunk)) return;
		const [message, metadata] = Array.isArray(chunk[0]) ? chunk[2] : chunk[1];
		if (!metadata.tags?.includes("notify")) return;
		if (!AIMessageChunk.isInstance(message)) return;
		if (!message.content || !Array.isArray(message.content)) return;
		for (const block of message.content) await this.handleContentBlock(block);
	}
	async handleContentBlock(block) {
		const index = block.index ?? 0;
		if (block.type === "text") await this.handleTextBlock(block, index);
		else if (block.type === "reasoning") await this.handleReasoningBlock(block, index);
	}
	async handleReasoningBlock(block, index) {
		const parser = this.getOrCreateParser(index);
		parser.append(block.text);
		this.writer.write({
			type: "data-content-block-reasoning",
			id: parser.id,
			data: {
				index,
				text: parser.getContent()
			}
		});
	}
	async handleTextBlock(block, index) {
		const parser = this.getOrCreateParser(index);
		parser.append(block.text);
		if (this.messageSchema) {
			const [isStructured, parsed] = await parser.tryParseStructured();
			if (parser.hasJsonStart() && !parser.hasEmittedPreamble) {
				const preamble = parser.getPreamble();
				if (preamble) {
					parser.hasEmittedPreamble = true;
					this.writer.write({
						type: "data-content-block-text",
						id: parser.textId,
						data: {
							index: parser.index,
							text: preamble
						}
					});
				}
			}
			if (parser.hasJsonStart() && isStructured && parsed) this.writer.write({
				type: "data-content-block-structured",
				id: parser.structuredId,
				data: {
					index: parser.index + 1,
					data: parsed,
					sourceText: parser.getContent()
				}
			});
		} else this.writer.write({
			type: "data-content-block-text",
			id: parser.textId,
			data: {
				index: parser.index,
				text: parser.getContent()
			}
		});
	}
};
var StateHandler = class extends Handler {
	stateDataParts = {};
	dataPartIds = {};
	async handle(chunk) {
		const updates = Array.isArray(chunk[0]) ? chunk[2] : chunk[1];
		for (const [nodeName, nodeUpdates] of Object.entries(updates)) {
			if (!nodeUpdates || typeof nodeUpdates !== "object") continue;
			Object.entries(nodeUpdates).forEach(([key, value]) => {
				if (key === "messages") return;
				if (isUndefined(value) || isNull(value)) return;
				const keyStr = String(key);
				const dataPartId = this.dataPartIds[keyStr] || crypto.randomUUID();
				this.dataPartIds[keyStr] = dataPartId;
				this.writer.write({
					type: `data-state-${keyStr}`,
					id: dataPartId,
					data: value
				});
			});
		}
	}
};
var CustomHandler = class extends Handler {
	async handle(chunk) {
		const data = Array.isArray(chunk[0]) ? chunk[2] : chunk[1];
		const defaultKeys = ["id", "event"];
		const eventName = data.event;
		if (!eventName || !data.id) return;
		const dataKeys = Object.entries(data).reduce((acc, [key, value]) => {
			if (typeof key === "string" && !defaultKeys.includes(key)) acc[key] = value;
			return acc;
		}, {});
		this.writer.write({
			type: kebabCase(`data-custom-${eventName}`),
			id: data.id,
			data: dataKeys
		});
	}
};
var EventsHandler = class extends Handler {
	toolCallHandler;
	constructor(writer, messageSchema, toolCallHandler) {
		super(writer, messageSchema);
		this.toolCallHandler = toolCallHandler;
	}
	async handle(chunk) {
		if (chunk[0] !== "events") return;
		const eventsData = chunk[1];
		const event = eventsData.data.event;
		const name = eventsData.data.name;
		const data = eventsData.data.data;
		if (event === "on_tool_end") await this.toolCallHandler.handleToolEnd(name, chunk);
		else if (event === "on_tool_error") await this.toolCallHandler.handleToolError(name, data);
	}
};
var Handlers = class {
	tool_calls;
	raw_messages;
	state;
	custom;
	events;
	constructor(writer, messageSchema) {
		this.tool_calls = new ToolCallHandler(writer, messageSchema);
		this.raw_messages = new RawMessageHandler(writer, messageSchema);
		this.state = new StateHandler(writer, messageSchema);
		this.custom = new CustomHandler(writer, messageSchema);
		this.events = new EventsHandler(writer, messageSchema, this.tool_calls);
	}
	async handle(chunk) {
		const type = Array.isArray(chunk[0]) ? chunk[1] : chunk[0];
		if (type === "messages") {
			await this.tool_calls.handle(chunk);
			await this.raw_messages.handle(chunk);
		} else if (type === "updates") await this.state.handle(chunk);
		else if (type === "custom") await this.custom.handle(chunk);
		else if (type === "events") await this.events.handle(chunk);
	}
};
var LanggraphStreamHandler = class {
	handlers;
	messageSchema;
	constructor(writer, messageSchema) {
		this.handlers = new Handlers(writer, messageSchema);
	}
	async *adaptStreamEvents(stream) {
		for await (const event of stream) if (event.event === "on_chain_stream") {
			const chunk = event.data.chunk;
			const [modeOrNs, dataOrMode, maybeData] = Array.isArray(chunk) ? chunk : [null, ...chunk];
			const mode = maybeData !== void 0 ? dataOrMode : modeOrNs;
			const data = maybeData !== void 0 ? maybeData : dataOrMode;
			if (mode === "messages" || mode === "updates" || mode === "custom") yield [mode, data];
		} else if (event.event.startsWith("on_")) yield ["events", {
			event: "events",
			data: event
		}];
	}
	async stream({ graph, messages, threadId, state, messageSchema }) {
		this.messageSchema = messageSchema;
		const graphState = {
			messages,
			...state
		};
		const stream = graph.streamEvents(graphState, {
			version: "v2",
			streamMode: [
				"messages",
				"updates",
				"custom"
			],
			context: { graphName: graph.name },
			configurable: { thread_id: threadId }
		});
		const eventsStream = this.adaptStreamEvents(stream);
		for await (const chunk of eventsStream) await this.handlers.handle(chunk);
	}
};
function createLanggraphUIStream({ graph, messages, threadId, messageSchema, state }) {
	return createUIMessageStream({ execute: async ({ writer }) => {
		try {
			await new LanggraphStreamHandler(writer, messageSchema).stream({
				graph,
				messages,
				threadId,
				state,
				messageSchema
			});
		} catch (error) {
			console.error("==========================================");
			console.error("STREAM ERROR - FAILING LOUDLY:");
			console.error("==========================================");
			console.error("Error details:", error);
			console.error("Error stack:", error instanceof Error ? error.stack : "No stack trace");
			console.error("Graph name:", graph.name);
			console.error("Thread ID:", threadId);
			console.error("==========================================");
			throw error;
		}
	} });
}
function createLanggraphStreamResponse(options) {
	return createUIMessageStreamResponse({ stream: createLanggraphUIStream(options) });
}
async function loadThreadHistory(graph, threadId, messageSchema) {
	const stateSnapshot = await graph.getState({ configurable: { thread_id: threadId } });
	if (!stateSnapshot || !stateSnapshot.values || !("messages" in stateSnapshot.values)) return {
		messages: [],
		state: {}
	};
	const messages = stateSnapshot.values.messages || [];
	const fullState = stateSnapshot.values;
	const globalState = {};
	for (const key in fullState) if (key !== "messages") {
		const value = fullState[key];
		if (value !== void 0 && value !== null) globalState[key] = value;
	}
	return {
		messages: messages.map((msg, idx) => {
			const isUser = msg._getType() === "human";
			const parts = [];
			if (isUser) {
				const content = typeof msg.content === "string" ? msg.content : "";
				parts.push({
					type: "text",
					id: crypto.randomUUID(),
					text: content
				});
			} else {
				const parsedBlocks = msg.response_metadata?.parsed_blocks;
				if (parsedBlocks && Array.isArray(parsedBlocks)) parsedBlocks.forEach((block) => {
					if (block.type === "structured" && block.parsed) parts.push({
						type: "data-content-block-structured",
						id: block.id,
						data: {
							index: block.index ?? 0,
							data: block.parsed,
							sourceText: block.sourceText
						}
					});
					else if (block.type === "text") parts.push({
						type: "data-content-block-text",
						id: block.id,
						data: {
							index: block.index ?? 0,
							text: block.sourceText
						}
					});
					else if (block.type === "reasoning") parts.push({
						type: "data-content-block-reasoning",
						id: block.id,
						data: {
							index: block.index ?? 0,
							text: block.sourceText
						}
					});
					else if (block.type === "tool_call") parts.push({
						type: `tool-${block.toolName}`,
						id: block.id,
						index: block.index ?? 0,
						toolCallId: block.toolCallId,
						toolName: block.toolName,
						input: block.toolArgs ? JSON.parse(block.toolArgs) : {}
					});
				});
			}
			return {
				id: `msg-${idx}`,
				role: isUser ? "user" : "assistant",
				parts
			};
		}),
		state: globalState
	};
}

//#endregion
//#region src/api.ts
function convertUIMessagesToLanggraph(messages) {
	return messages.map((msg) => {
		const textPart = msg.parts.find((p) => p.type === "text");
		const text$1 = textPart?.type === "text" ? textPart.text : "";
		switch (msg.role) {
			case "user": return new HumanMessage(text$1);
			case "system": return new SystemMessage(text$1);
			case "assistant": return new AIMessage(text$1);
			default: throw new Error(`Unknown role: ${msg.role}`);
		}
	});
}
/**
* Core function that works with parsed data - framework agnostic
* Use this when you've already parsed the request body (e.g., in Hono, Express, etc.)
*/
async function streamLanggraph({ graph, messageSchema, messages, state = {}, threadId }) {
	let finalThreadId = threadId;
	const newMessage = convertUIMessagesToLanggraph(messages).at(-1);
	if (!newMessage) return new Response(JSON.stringify({ error: "No messages provided" }), {
		status: 400,
		headers: { "Content-Type": "application/json" }
	});
	const response = createLanggraphStreamResponse({
		graph,
		messages: [newMessage],
		threadId: finalThreadId,
		state,
		messageSchema
	});
	response.headers.set("X-Thread-ID", finalThreadId);
	return response;
}
/**
* Core function that works with parsed data - framework agnostic
* Use this when you've already extracted the threadId from the request (e.g., in Hono, Express, etc.)
*/
async function fetchLanggraphHistory({ graph, messageSchema, threadId }) {
	if (!threadId) return new Response(JSON.stringify({ error: "threadId required" }), {
		status: 400,
		headers: { "Content-Type": "application/json" }
	});
	if (!graph) return new Response(JSON.stringify({ error: `Graph not found` }), {
		status: 404,
		headers: { "Content-Type": "application/json" }
	});
	const { messages, state } = await loadThreadHistory(graph, threadId, messageSchema);
	return new Response(JSON.stringify({
		messages,
		state
	}), { headers: { "Content-Type": "application/json" } });
}

//#endregion
//#region db/schema.ts
var schema_exports = /* @__PURE__ */ __export({ threads: () => threads });
const threads = pgTable("threads", {
	threadId: uuid("thread_id").primaryKey().defaultRandom().unique("unique_thread_id"),
	createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
	metadata: jsonb("metadata").notNull().default({}),
	status: text("status").notNull().default("idle"),
	config: jsonb("config").notNull().default({}),
	values: jsonb("values"),
	interrupts: jsonb("interrupts").default({})
});

//#endregion
//#region src/config.ts
const config = {
	db: null,
	pool: null
};
/**
* Initialize the library with your database connection
* This should be called once at app startup before using any API functions
*
* @example
* ```typescript
* import { Pool } from 'pg';
* import { initializeLanggraph } from 'langgraph-ai-sdk';
*
* const pool = new Pool({ connectionString: process.env.DATABASE_URL });
* initializeLanggraph({ pool });
* ```
*/
function initializeLanggraph({ pool }) {
	config.pool = pool;
	config.db = drizzle(pool, { schema: schema_exports });
}
/**
* Get the configured database instance
* Throws an error if the library hasn't been initialized
*/
function getDb() {
	if (!config.db) throw new Error("Database not initialized. Call initializeLanggraph({ pool }) before using any API functions.");
	return config.db;
}
/**
* Get the configured pool instance
* Throws an error if the library hasn't been initialized
*/
function getPool() {
	if (!config.pool) throw new Error("Database not initialized. Call initializeLanggraph({ pool }) before using any API functions.");
	return config.pool;
}
/**
* Check if the library has been initialized
*/
function isInitialized() {
	return config.db !== null && config.pool !== null;
}

//#endregion
export { TextBlockParser, createLanggraphStreamResponse, createLanggraphUIStream, fetchLanggraphHistory, getDb, getPool, getSchemaKeys, initializeLanggraph, isInitialized, loadThreadHistory, streamLanggraph, toStructuredMessage };