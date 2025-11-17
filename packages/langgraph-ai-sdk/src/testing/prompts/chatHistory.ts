import { Message } from "@langchain/core/messages";
import { isHumanMessage } from "../../message";
import { renderPrompt } from "./renderPrompt";

/**
 * The chatHistory function renders a <chat-history> tag,
 * listing messages as <message> sub-elements with "role: content".
 *
 * @param messages - An array of message objects with "role" and "content".
 *
 * @example
 * ```ts
 * const messages = [
 *   { role: 'system', content: 'You are a helpful AI assistant.' },
 *   { role: 'user', content: 'Hello!' }
 * ];
 *
 * chatHistory({ messages })
 * ```
 */
export async function chatHistoryPrompt({ messages }: { messages: Message[] }): Promise<string> {
  const messageElements = messages?.map((message) => {
    const type = isHumanMessage(message) ? "human" : "assistant";

    return `<message>${type}: ${JSON.stringify(message.content, null, 4)}</message>`;
  }).join('') || '';
  
  return renderPrompt(`<chat-history>${messageElements}</chat-history>`);
}