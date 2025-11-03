import { useEffect, useEffectEvent, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { v7 } from "uuid";

//#region src/useLanggraph.tsx
function useLanggraph({ api = "/api/chat", headers = {}, getInitialThreadId }) {
	const threadId = useRef(getInitialThreadId?.() ?? v7()).current;
	const [error, setError] = useState(null);
	const [serverState, setServerState] = useState({});
	const [hasSubmitted, setHasSubmitted] = useState(false);
	const headersRef = useRef(headers);
	const [isLoadingHistory, setIsLoadingHistory] = useState(true);
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
	const messages = useMemo(() => {
		return chat.messages.map((msg) => {
			if (msg.role !== "assistant") return {
				id: msg.id,
				role: msg.role,
				parts: msg.parts.filter((p) => p.type === "text").map((p) => ({
					type: "text",
					text: p.text,
					id: p.id || crypto.randomUUID()
				}))
			};
			const textParts = msg.parts.filter((p) => p.type === "data-message-text");
			if (textParts.length > 0) return {
				id: msg.id,
				role: msg.role,
				parts: textParts.map((p) => ({
					type: "text",
					text: p.data,
					id: p.id
				}))
			};
			const messageParts = msg.parts.filter((p) => p.type.startsWith("data-message-")).map((p) => ({
				type: p.type.replace("data-message-", ""),
				data: p.data,
				id: p.id
			}));
			return {
				id: msg.id,
				role: msg.role,
				parts: messageParts
			};
		});
	}, [chat.messages]);
	return {
		...chat,
		sendMessage,
		messages,
		state,
		threadId: hasSubmitted ? threadId : void 0,
		error,
		isLoadingHistory
	};
}

//#endregion
export { useLanggraph };