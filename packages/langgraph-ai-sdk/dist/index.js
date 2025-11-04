import { v7 } from "uuid";
import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { createUIMessageStream, createUIMessageStreamResponse, parsePartialJson } from "ai";
import { kebabCase } from "change-case";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pkg from "pg";
import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

//#region rolldown:runtime
var __defProp = Object.defineProperty;
var __export = (all) => {
	let target = {};
	for (var name in all) __defProp(target, name, {
		get: all[name],
		enumerable: true
	});
	return target;
};

//#endregion
//#region src/stream.ts
function getSchemaKeys(schema) {
	return Object.keys(schema.shape);
}
function createLanggraphUIStream({ graph, messages, threadId, messageSchema, state }) {
	return createUIMessageStream({ execute: async ({ writer }) => {
		const stream = await graph.stream({
			messages,
			...state
		}, {
			streamMode: [
				"messages",
				"updates",
				"custom"
			],
			context: { graphName: graph.name },
			configurable: { thread_id: threadId }
		});
		const stateDataPartIds = {};
		const messagePartIds = messageSchema ? {} : { text: crypto.randomUUID() };
		let messageBuffer = "";
		for await (const chunk of stream) {
			const chunkArray = chunk;
			let kind;
			let data;
			if (chunkArray.length === 2) [kind, data] = chunkArray;
			else if (chunkArray.length === 3) [, kind, data] = chunkArray;
			else continue;
			if (kind === "messages") {
				const [message, metadata] = data;
				if (message?.content && metadata?.tags?.includes("notify")) {
					let content = typeof message.content === "string" ? message.content : "";
					messageBuffer += content;
					if (messageSchema) {
						let cleanedBuffer = messageBuffer;
						if (cleanedBuffer.includes("```json")) cleanedBuffer = cleanedBuffer.replace(/```json/g, "").trim();
						if (cleanedBuffer.includes("```")) cleanedBuffer = cleanedBuffer.split("```")[0];
						cleanedBuffer = cleanedBuffer.trim();
						const parsed = (await parsePartialJson(cleanedBuffer)).value;
						if (parsed) Object.entries(parsed).forEach(([key, value]) => {
							if (value !== void 0) {
								const partId = messagePartIds[key] || crypto.randomUUID();
								messagePartIds[key] = partId;
								const structuredMessagePart = {
									type: `data-message-${key}`,
									id: partId,
									data: value
								};
								writer.write(structuredMessagePart);
							}
						});
					} else writer.write({
						type: "data-message-text",
						id: messagePartIds.text,
						data: messageBuffer
					});
				}
			} else if (kind === "updates") {
				const updates = data;
				for (const [nodeName, nodeUpdates] of Object.entries(updates)) {
					if (!nodeUpdates || typeof nodeUpdates !== "object") continue;
					Object.keys(nodeUpdates).forEach((key) => {
						const value = nodeUpdates[key];
						if (value === void 0 || value === null) return;
						if (key === "messages") return;
						const keyStr = String(key);
						const dataPartId = stateDataPartIds[keyStr] || crypto.randomUUID();
						stateDataPartIds[keyStr] = dataPartId;
						writer.write({
							type: `data-state-${keyStr}`,
							id: dataPartId,
							data: value
						});
					});
				}
			} else if (kind === "custom") {
				const customData = data;
				const defaultKeys = ["id", "event"];
				const eventName = customData.event;
				if (!eventName || !customData.id) continue;
				const dataKeys = Object.entries(customData).reduce((acc, [key, value]) => {
					if (typeof key === "string" && !defaultKeys.includes(key)) acc[key] = value;
					return acc;
				}, {});
				writer.write({
					type: kebabCase(`data-custom-${eventName}`),
					id: customData.id,
					data: dataKeys
				});
			}
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