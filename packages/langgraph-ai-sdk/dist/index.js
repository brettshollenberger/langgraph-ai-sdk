import { n as __export } from "./chunk-DUEDWNxO.js";
import { v7 } from "uuid";
import { AIMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { createUIMessageStream, createUIMessageStreamResponse, parsePartialJson } from "ai";
import { kebabCase } from "change-case";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import pkg from "pg";
import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

//#region src/stream.ts
function getSchemaKeys(schema) {
	console.log(schema);
	return Object.keys(schema.shape);
}
function createLanggraphUIStream({ graph, messages, threadId, messageSchema, state }) {
	return createUIMessageStream({ execute: async ({ writer }) => {
		try {
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
			const messageKeys = messageSchema ? getSchemaKeys(messageSchema).filter((key) => typeof key === "string") : [];
			let messageBuffer = "";
			let toolArgsBuffer = "";
			let lastSentValues = {};
			let isCapturingJson = false;
			let isFallbackMode = false;
			let canEnterFallbackMode = true;
			let isStructuredComplete = false;
			for await (const chunk of stream) {
				const chunkArray = chunk;
				let kind;
				let data;
				if (chunkArray.length === 2) [kind, data] = chunkArray;
				else if (chunkArray.length === 3) [, kind, data] = chunkArray;
				else continue;
				if (kind === "messages") {
					const [message, metadata] = data;
					if (metadata?.tags?.includes("notify")) {
						if (isStructuredComplete) continue;
						if (messageSchema && message?.tool_call_chunks && message.tool_call_chunks.length > 0) {
							const toolArgs = message.tool_call_chunks[0].args;
							if (toolArgs) {
								toolArgsBuffer += toolArgs;
								const parsed = (await parsePartialJson(toolArgsBuffer)).value;
								if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
									console.log("[STREAM] Parsed tool call data:", Object.keys(parsed));
									Object.entries(parsed).forEach(([key, value]) => {
										if (value !== void 0 && messageKeys.includes(key)) {
											const valueStr = JSON.stringify(value);
											if (valueStr !== lastSentValues[key]) {
												const partId = messagePartIds[key] || crypto.randomUUID();
												messagePartIds[key] = partId;
												lastSentValues[key] = valueStr;
												const structuredMessagePart = {
													type: `data-message-${key}`,
													id: partId,
													data: value
												};
												console.log(`[STREAM] Writing updated part: ${key}`);
												writer.write(structuredMessagePart);
											}
										}
									});
								}
								if (message.additional_kwargs?.stop_reason === "tool_use") {
									console.log("[STREAM] ✅ Tool call complete, marking structured output as complete");
									isStructuredComplete = true;
									toolArgsBuffer = "";
									lastSentValues = {};
								}
							}
							continue;
						}
						let content = "";
						if (message?.content) {
							if (Array.isArray(message.content)) content = message.content.map((content$1) => {
								return content$1.text;
							}).join("");
							else if (typeof message.content === "string") content = message.content;
						}
						messageBuffer += content;
						if (messageSchema) {
							if (!isCapturingJson && canEnterFallbackMode && !isFallbackMode && messageBuffer.length > 200) {
								isFallbackMode = true;
								const partId = messagePartIds.text || crypto.randomUUID();
								messagePartIds.text = partId;
								writer.write({
									type: "data-message-text",
									id: partId,
									data: messageBuffer
								});
							} else if (isFallbackMode) writer.write({
								type: "data-message-text",
								id: messagePartIds.text,
								data: messageBuffer
							});
							else if (!isCapturingJson && messageBuffer.includes("```json")) {
								isCapturingJson = true;
								canEnterFallbackMode = false;
								const jsonStartIndex = messageBuffer.indexOf("```json") + 7;
								messageBuffer = messageBuffer.substring(jsonStartIndex);
							}
							if (!isFallbackMode) {
								let shouldParse = isCapturingJson;
								if (isCapturingJson && messageBuffer.includes("```")) {
									const jsonEndIndex = messageBuffer.indexOf("```");
									messageBuffer = messageBuffer.substring(0, jsonEndIndex);
									shouldParse = true;
									isCapturingJson = false;
								}
								if (shouldParse) {
									const parsed = (await parsePartialJson(messageBuffer.trim())).value;
									if (parsed) {
										console.log("[STREAM] Writing structured parts:", Object.keys(parsed));
										Object.entries(parsed).forEach(([key, value]) => {
											if (value !== void 0) {
												const partId = messagePartIds[key] || crypto.randomUUID();
												messagePartIds[key] = partId;
												const structuredMessagePart = {
													type: `data-message-${key}`,
													id: partId,
													data: value
												};
												console.log(`[STREAM] Writing part: ${key}, data:`, typeof value === "string" ? value.substring(0, 50) : value);
												writer.write(structuredMessagePart);
											}
										});
										if (!isCapturingJson) {
											console.log("[STREAM] ✅ Structured output complete, clearing buffer");
											messageBuffer = "";
										}
									}
								}
							}
						} else {
							console.log("[STREAM] Writing unstructured text, bc no schema!:", messageBuffer);
							writer.write({
								type: "data-message-text",
								id: messagePartIds.text,
								data: messageBuffer
							});
						}
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
							console.log("Streaming state update:", {
								type: `data-state-${keyStr}`,
								id: dataPartId,
								data: value
							});
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