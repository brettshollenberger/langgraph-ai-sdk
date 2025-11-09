import { n as __export } from "./chunk-C3Lxiq5Q.js";
import { v7 } from "uuid";
import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { createUIMessageStream, createUIMessageStreamResponse, parsePartialJson } from "ai";
import { kebabCase } from "change-case";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pkg from "pg";
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
	if (!schema || !schema.shape) return [];
	return Object.keys(schema.shape);
}
var Handler = class {
	writer;
	messageSchema;
	constructor(writer, messageSchema) {
		this.writer = writer;
		this.messageSchema = messageSchema;
	}
};
var StructuredMessageToolHandler = class extends Handler {
	messagePartIds = {};
	schemaKeys;
	toolArgsBuffer = "";
	toolValues = {};
	currentToolName;
	constructor(writer, messageSchema) {
		super(writer, messageSchema);
		this.schemaKeys = messageSchema ? getSchemaKeys(messageSchema).filter((key) => typeof key === "string") : [];
	}
	async handle(chunk) {
		if (!this.messageSchema) return;
		if (chunk[0] !== "messages" && !(Array.isArray(chunk[0]) && chunk[1] === "messages")) return;
		const [message, metadata] = Array.isArray(chunk[0]) ? chunk[2] : chunk[1];
		if (!metadata.tags?.includes("notify")) return;
		if (!message || !("tool_call_chunks" in message) || typeof message.tool_call_chunks !== "object" || !Array.isArray(message.tool_call_chunks)) return;
		if (message.tool_call_chunks.length === 0) return;
		for (const chunk$1 of message.tool_call_chunks) {
			if (isString(chunk$1.name)) this.currentToolName = chunk$1.name;
			if (!this.currentToolName?.match(/^extract/)) continue;
			const toolArgs = chunk$1.args;
			this.toolArgsBuffer += toolArgs;
			await this.writeToolCall();
		}
	}
	async writeToolCall() {
		const parsed = (await parsePartialJson(this.toolArgsBuffer)).value;
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) Object.entries(parsed).forEach(([key, value]) => {
			if (this.schemaKeys.includes(key) && !isUndefined(value) && !isNull(value)) {
				if (this.toolValues[key] !== value) {
					this.toolValues[key] = JSON.stringify(value);
					const messagePartId = this.messagePartIds[key] || crypto.randomUUID();
					this.messagePartIds[key] = messagePartId;
					const structuredMessagePart = {
						type: `data-message-${key}`,
						id: messagePartId,
						data: value
					};
					this.writer.write(structuredMessagePart);
				}
			}
		});
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
	messagePartIds = {};
	schemaKeys;
	toolArgsBuffer = "";
	toolValues = {};
	currentToolName;
	handlers;
	constructor(writer, messageSchema) {
		super(writer, messageSchema);
		this.schemaKeys = messageSchema ? getSchemaKeys(messageSchema).filter((key) => typeof key === "string") : [];
		this.handlers = {
			structured_messages: new StructuredMessageToolHandler(writer, messageSchema),
			other_tools: new OtherToolHandler(writer, messageSchema)
		};
	}
	async handle(chunk) {
		await this.handlers.structured_messages.handle(chunk);
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
	messageBuffer = "";
	messagePartId;
	async handle(chunk) {
		if (this.messageSchema) return;
		if (chunk[0] !== "messages" && !(Array.isArray(chunk[0]) && chunk[1] === "messages")) return;
		const [message, metadata] = Array.isArray(chunk[0]) ? chunk[2] : chunk[1];
		if (!metadata.tags?.includes("notify")) return;
		if (isUndefined(this.messagePartId)) this.messagePartId = crypto.randomUUID();
		const content = typeof message.content === "string" ? message.content : "";
		this.messageBuffer += content;
		this.writer.write({
			type: "data-message-text",
			id: this.messagePartId,
			data: this.messageBuffer
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
				"updates",
				"custom",
				"messages"
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
			const content = typeof msg.content === "string" ? msg.content : "";
			const parts = [];
			if (isUser) parts.push({
				type: "text",
				id: crypto.randomUUID(),
				text: content
			});
			else if (messageSchema) Object.entries(msg.response_metadata).forEach(([key, value]) => {
				parts.push({
					type: `data-message-${key}`,
					id: crypto.randomUUID(),
					data: value
				});
			});
			else parts.push({
				type: "data-message-text",
				id: crypto.randomUUID(),
				data: content
			});
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
//#region src/registry.ts
const graphRegistry = /* @__PURE__ */ new Map();
function registerGraph(name, graph) {
	graphRegistry.set(name, graph);
}
function getGraph(name) {
	return graphRegistry.get(name);
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
//#region db/index.ts
const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL || "postgresql://localhost/langgraph_backend_test" });
const db = drizzle(pool, { schema: schema_exports });

//#endregion
//#region src/ops.ts
async function ensureThread(threadId) {
	if ((await db.select().from(threads).where(eq(threads.threadId, threadId)).limit(1)).length === 0) await db.insert(threads).values({
		threadId,
		createdAt: /* @__PURE__ */ new Date(),
		updatedAt: /* @__PURE__ */ new Date(),
		metadata: {},
		status: "idle",
		config: {},
		values: null,
		interrupts: {}
	});
	return threadId;
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
function streamLanggraph({ graphName, messageSchema }) {
	return async (req) => {
		const body = await req.json();
		const uiMessages = body.messages;
		const state = body.state || {};
		let threadId = body.threadId;
		if (!threadId) {
			threadId = v7();
			await ensureThread(threadId);
		}
		const graph = getGraph(graphName);
		if (!graph) return new Response(JSON.stringify({ error: `Graph '${graphName}' not found` }), {
			status: 404,
			headers: { "Content-Type": "application/json" }
		});
		const newMessage = convertUIMessagesToLanggraph(uiMessages).at(-1);
		if (!newMessage) return new Response(JSON.stringify({ error: "No messages provided" }), {
			status: 400,
			headers: { "Content-Type": "application/json" }
		});
		const response = createLanggraphStreamResponse({
			graph,
			messages: [newMessage],
			threadId,
			state,
			messageSchema
		});
		response.headers.set("X-Thread-ID", threadId);
		return response;
	};
}
function fetchLanggraphHistory({ graphName, messageSchema }) {
	return async (req) => {
		const threadId = new URL(req.url).searchParams.get("threadId");
		if (!threadId) return new Response(JSON.stringify({ error: "threadId required" }), {
			status: 400,
			headers: { "Content-Type": "application/json" }
		});
		const graph = getGraph(graphName);
		if (!graph) return new Response(JSON.stringify({ error: `Graph '${graphName}' not found` }), {
			status: 404,
			headers: { "Content-Type": "application/json" }
		});
		const { messages, state } = await loadThreadHistory(graph, threadId, messageSchema);
		return new Response(JSON.stringify({
			messages,
			state
		}), { headers: { "Content-Type": "application/json" } });
	};
}

//#endregion
export { createLanggraphStreamResponse, createLanggraphUIStream, fetchLanggraphHistory, getGraph, getSchemaKeys, loadThreadHistory, registerGraph, streamLanggraph };