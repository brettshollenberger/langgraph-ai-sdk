import { parsePartialJson } from 'ai';
import { AIMessage, AIMessageChunk } from '@langchain/core/messages';
export class RawJSONParser {
    messageBuffer: string = '';
    hasSeenJsonStart: boolean = false;
    hasSeenJsonEnd: boolean = false;

    async parse(message: AIMessage | AIMessageChunk): Promise<[boolean, Record<string, any> | undefined]> {
        try {
            let content;
            if (typeof message.content === 'object' && ('text' in message.content) && typeof message.content.text === 'string') {
                content = message.content.text;
            } else if (Array.isArray(message.content) && message.content.length > 0) {
                let structuredContent = message.content[0] as { index: number, type: string, text: string };
                content = structuredContent.text;
            } else {
                return [false, undefined];
            }
            
            this.messageBuffer += content;
            if (this.messageBuffer.includes('```json')) {
                const indexOfJsonStart = this.messageBuffer.indexOf('```json');
                this.messageBuffer = this.messageBuffer.substring(indexOfJsonStart + '```json'.length);
                this.hasSeenJsonStart = true;
            }
            if (this.hasSeenJsonStart && this.messageBuffer.includes('```')) {
                this.messageBuffer = this.messageBuffer.replace(/```/g, '');
                this.hasSeenJsonEnd = true;
            }
            
            if (this.hasSeenJsonStart && this.hasSeenJsonEnd) {
                this.hasSeenJsonStart = false;
                this.hasSeenJsonEnd = false;
            }

            const parseResult = await parsePartialJson(this.messageBuffer);
            const parsed = parseResult.value;
            if (!parsed || typeof parsed !== 'object') return [false, undefined];

            return [true, parsed];
        } catch (e) {
            return [false, undefined];
        }
    }
}