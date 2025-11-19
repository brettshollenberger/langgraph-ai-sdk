import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { v7 } from "uuid";

//#region src/useLanggraph.tsx
function useLanggraph({ api = "/api/chat", headers = {}, getInitialThreadId }) {
	const initialThreadVal = getInitialThreadId?.();
	const threadId = useRef(initialThreadVal ?? v7()).current;
	const [error, setError] = useState(null);
	const [serverState, setServerState] = useState({});
	const [hasSubmitted, setHasSubmitted] = useState(false);
	const headersRef = useRef(headers);
	const [isLoadingHistory, setIsLoadingHistory] = useState(true);
	const isNewThread = useRef(!initialThreadVal);
	const chat = useChat({
		transport: new DefaultChatTransport({
			api,
			headers,
			body: { threadId }
		}),
		onError: (error$1) => {
			setError(error$1.message);
		}
	});
	const sendMessage = (message, additionalState) => {
		if (!hasSubmitted) setHasSubmitted(true);
		const options = additionalState ? { body: { state: additionalState } } : void 0;
		const messageParam = typeof message === "string" ? { text: message } : message;
		chat.sendMessage(messageParam, options);
	};
	const loadHistory = useEffectEvent(async () => {
		if (isNewThread.current) {
			setIsLoadingHistory(false);
			return;
		}
		try {
			const response = await fetch(`${api}?threadId=${threadId}`, { headers: headersRef.current });
			if (response.ok) {
				const data = await response.json();
				if (data.messages && data.messages.length > 0) chat.setMessages(data.messages);
				if (data.state) setServerState(data.state);
			}
		} catch (error$1) {
			console.error("Failed to load history:", error$1);
		} finally {
			setIsLoadingHistory(false);
		}
	});
	useEffect(() => {
		loadHistory();
	}, [threadId, api]);
	const state = useMemo(() => {
		const latestAI = chat.messages.filter((m) => m.role === "assistant").at(-1);
		if (latestAI) {
			const newState = { ...serverState };
			for (const part of latestAI.parts) if (part.type.startsWith("data-state-")) {
				const key = part.type.replace("data-state-", "");
				if ("data" in part) newState[key] = part.data;
			}
			return newState;
		}
		return serverState;
	}, [chat.messages, serverState]);
	const customEvents = useMemo(() => {
		const latestAI = chat.messages.filter((m) => m.role === "assistant").at(-1);
		if (latestAI) {
			const newEvents = [];
			for (const part of latestAI.parts) if (part.type.startsWith("data-custom-")) {
				const key = part.type.replace("data-custom-", "");
				if ("data" in part && "id" in part && "type" in part && typeof part.id === "string" && typeof key === "string" && typeof part.data === "object") newEvents.push({
					id: part.id,
					type: key,
					data: part.data
				});
			}
			return newEvents;
		}
		return [];
	}, [chat.messages]);
	const messages = useMemo(() => {
		return chat.messages.map((msg) => {
			if (msg.role === "user") {
				const textPart = msg.parts.find((p) => p.type === "text");
				const text = textPart && "text" in textPart ? textPart.text : "";
				return {
					id: msg.id,
					role: msg.role,
					blocks: text ? [{
						type: "text",
						index: 0,
						text,
						id: crypto.randomUUID()
					}] : []
				};
			}
			const blocksByIndex = /* @__PURE__ */ new Map();
			msg.parts.forEach((part) => {
				if (part.type.startsWith("data-content-block-")) {
					const index = part.data?.index ?? 0;
					if (!blocksByIndex.has(index)) blocksByIndex.set(index, []);
					blocksByIndex.get(index).push(part);
				} else if (part.type.startsWith("tool-")) {
					const index = part.data?.index ?? 0;
					if (!blocksByIndex.has(index)) blocksByIndex.set(index, []);
					blocksByIndex.get(index).push(part);
				}
			});
			const blocks = Array.from(blocksByIndex.entries()).sort((a, b) => a[0] - b[0]).flatMap(([index, parts]) => {
				return parts.map((part) => convertPartToBlock(part, index));
			});
			return {
				id: msg.id,
				role: msg.role,
				blocks
			};
		});
	}, [chat.messages]);
	function convertPartToBlock(part, index) {
		if (part.type === "data-content-block-text") return {
			type: "text",
			index,
			text: part.data.text,
			id: part.id
		};
		else if (part.type === "data-content-block-structured") return {
			type: "structured",
			index,
			data: part.data.data,
			sourceText: part.data.sourceText,
			id: part.id
		};
		else if (part.type === "data-content-block-reasoning") return {
			type: "reasoning",
			index,
			text: part.data.text,
			id: part.id
		};
		else if (part.type.startsWith("tool-")) return {
			type: "tool_call",
			index,
			toolCallId: part.data?.toolCallId || part.toolCallId,
			toolName: part.type.replace("tool-", ""),
			input: part.data?.input || part.input,
			output: part.data?.output || part.output,
			state: part.data?.errorText || part.errorText ? "error" : part.data?.output || part.output ? "complete" : "running",
			errorText: part.data?.errorText || part.errorText,
			id: part.id || crypto.randomUUID()
		};
		return {
			type: "text",
			index: 0,
			text: JSON.stringify(part),
			id: crypto.randomUUID()
		};
	}
	const tools = useMemo(() => {
		const lastAIMessage = chat.messages.filter((m) => m.role === "assistant").at(-1);
		if (!lastAIMessage) return [];
		return lastAIMessage.parts.filter((p) => p.type.startsWith("tool-")).map((p) => {
			const toolCall = p;
			const toolCallId = toolCall.toolCallId;
			const output = toolCall.output;
			const state$1 = toolCall.errorText !== void 0 ? "error" : output ? "complete" : "running";
			return {
				type: "tool",
				toolCallId,
				toolName: toolCall.type.replace("tool-", ""),
				input: toolCall.input,
				output,
				state: state$1,
				error: toolCall.errorText,
				id: toolCall.id || crypto.randomUUID()
			};
		});
	}, [chat.messages]);
	return {
		...chat,
		sendMessage,
		messages,
		state,
		tools,
		events: customEvents,
		threadId: hasSubmitted ? threadId : void 0,
		error,
		isLoadingHistory
	};
}

//#endregion
export { useLanggraph };