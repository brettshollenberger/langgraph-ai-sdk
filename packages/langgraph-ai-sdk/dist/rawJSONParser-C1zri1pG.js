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
export { RawJSONParser as t };