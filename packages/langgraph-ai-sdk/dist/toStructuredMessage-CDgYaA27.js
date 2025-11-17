import { AIMessage } from "@langchain/core/messages";
import { parsePartialJson } from "ai";

//#region src/rawJSONParser.ts
var RawJSONParser = class {
	messageBuffer = "";
	hasSeenJsonStart = false;
	hasSeenJsonEnd = false;
	async parse(message) {
		try {
			let content;
			if (typeof message.content === "object" && "text" in message.content && typeof message.content.text === "string") content = message.content.text;
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
	if (result instanceof AIMessage) return result;
	return await parseStructuredChunk(result);
}
async function parseStructuredChunk(result) {
	const [success, parsed] = await new RawJSONParser().parse(result);
	if (success && parsed) return new AIMessage({
		content: JSON.stringify(parsed),
		response_metadata: parsed
	});
	return null;
}

//#endregion
export { toStructuredMessage as n, RawJSONParser as r, parseStructuredChunk as t };