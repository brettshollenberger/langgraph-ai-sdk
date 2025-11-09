import { HumanMessage } from "@langchain/core/messages";

export function isHumanMessage(msg: unknown): msg is HumanMessage {
    return msg instanceof HumanMessage;
}
