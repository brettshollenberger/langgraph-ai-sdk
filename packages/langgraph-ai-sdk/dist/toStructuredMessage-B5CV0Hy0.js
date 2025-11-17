import { AIMessage, isAIMessage } from "@langchain/core/messages";
import { parsePartialJson } from "ai";

//#region src/rawJSONParser.ts
var RawJSONParser = class {
	messageBuffer = "";
	hasSeenJsonStart = false;
	hasSeenJsonEnd = false;
	async parse(message) {
		try {
			let content;
			if (typeof message.content === "string") content = message.content;
			else if (typeof message.content === "object" && "text" in message.content && typeof message.content.text === "string") content = message.content.text;
			else if (Array.isArray(message.content) && message.content.length > 0) content = message.content[0].text;
			else return [false, void 0];
			this.messageBuffer += content;
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
};

//#endregion
//#region src/toStructuredMessage.ts
async function toStructuredMessage(result) {
	if (!result) throw new Error("Handler result must be an AIMessage or an object with messages and structuredResponse properties");
	if (isAIMessage(result)) {
		if (typeof result.content === "string" && result.content.match("```json")) return parseStructuredChunk(result);
		return result;
	}
	if (isToolCall(result)) return result;
	return await parseStructuredChunk(result);
}
async function parseStructuredChunk(result) {
	const [success, parsed] = await new RawJSONParser().parse(result);
	if (isAIMessage(result)) {
		if (result.response_metadata) result.response_metadata = {
			...result.response_metadata,
			...parsed
		};
		return result;
	}
	if (success && parsed) return new AIMessage({
		content: JSON.stringify(parsed),
		response_metadata: parsed
	});
	return null;
}
const isToolCall = (message) => {
	if (!message.content || !message.content[0]) return false;
	let content = message.content[0];
	if (typeof content !== "object" || !("type" in content)) return false;
	return content.type === "tool_use";
};

//#endregion
export { toStructuredMessage as n, RawJSONParser as r, parseStructuredChunk as t };