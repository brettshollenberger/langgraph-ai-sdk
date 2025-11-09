import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { v7 } from "uuid";

//#region src/useLanggraph.tsx
function useLanggraph({ api = "/api/chat", headers = {}, getInitialThreadId }) {
	const [currentApi, setCurrentApi] = useState(api);
	const [chatKey, setChatKey] = useState(0);
	const getInitialThreadIdEvent = useEffectEvent(() => {
		return getInitialThreadId?.() ?? v7();
	});
	useEffect(() => {
		if (currentApi !== api) {
			setCurrentApi(api);
			setChatKey((prev) => prev + 1);
			setError(null);
			setServerState({});
			setHasSubmitted(false);
			setIsLoadingHistory(true);
			threadIdRef.current = getInitialThreadIdEvent();
		}
	}, [api, currentApi]);
	const threadIdRef = useRef(getInitialThreadId?.() ?? v7());
	const threadId = threadIdRef.current;
	const [error, setError] = useState(null);
	const [serverState, setServerState] = useState({});
	const [hasSubmitted, setHasSubmitted] = useState(false);
	const headersRef = useRef(headers);
	const [isLoadingHistory, setIsLoadingHistory] = useState(true);
	const chat = useChat({
		id: `chat-${chatKey}`,
		transport: new DefaultChatTransport({
			api,
			headers,
			body: { threadId }
		}),
		onError: (error$1) => {
			setError(error$1.message);
		}
	});
	const sendMessage = (...args) => {
		if (!hasSubmitted) setHasSubmitted(true);
		chat.sendMessage(...args);
	};
	const loadHistory = useEffectEvent(async () => {
		if (!threadId) {
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
			if (msg.role !== "assistant") {
				const textPart = msg.parts.find((p) => p.type === "text");
				const text = textPart && "text" in textPart ? textPart.text : "";
				return {
					id: msg.id,
					role: msg.role,
					type: "text",
					text
				};
			}
			const textParts = msg.parts.filter((p) => p.type === "data-message-text");
			const otherParts = msg.parts.filter((p) => p.type !== "data-message-text" && p.type.startsWith("data-message-"));
			if (textParts.length > 0 && otherParts.length === 0) {
				const text = textParts.map((p) => p.data).join("");
				return {
					id: msg.id,
					role: msg.role,
					type: "text",
					text
				};
			}
			const messageParts = msg.parts.filter((p) => typeof p.type === "string" && p.type.startsWith("data-message-")).map((p) => ({
				type: p.type,
				data: p.data,
				id: p.id
			}));
			const userSpecifiedOutputType = messageParts.reduce((acc, part) => {
				if (typeof part.type !== "string") return acc;
				const key = part.type.replace("data-message-", "");
				acc[key] = part.data;
				return acc;
			}, {});
			const messageType = messageParts.length > 0 ? messageParts[0].type.replace("data-message-", "") : "structured";
			const state$1 = Object.keys(userSpecifiedOutputType).filter((k) => k !== "type").length > 0 ? "streaming" : "thinking";
			return {
				id: msg.id,
				state: state$1,
				role: msg.role,
				type: messageType,
				...userSpecifiedOutputType
			};
		});
	}, [chat.messages]);
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