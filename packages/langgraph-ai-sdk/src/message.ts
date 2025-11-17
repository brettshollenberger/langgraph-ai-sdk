import { BaseMessage, isAIMessage, isHumanMessage } from "@langchain/core/messages";

export { isAIMessage, isHumanMessage }

interface RecordWithMessages {
    messages: BaseMessage[];
}

export const lastMessage = (record: RecordWithMessages, filter?: (msg: BaseMessage) => boolean): BaseMessage | undefined => {
  if (!record.messages || record.messages.length === 0) {
    return undefined;
  }
  const messages = record.messages.filter(filter || (() => true));
  return messages[messages.length - 1];
};

export const lastAIMessage = (record: RecordWithMessages): BaseMessage | undefined => {
  return lastMessage(record, isAIMessage);
};

export const lastHumanMessage = (record: RecordWithMessages): BaseMessage | undefined => {
  return lastMessage(record, isHumanMessage);
};

export const countHumanMessages = (record: RecordWithMessages): number => {
  if (!record.messages || record.messages.length === 0) {
    return 0;
  }
  const humanMessages = record.messages.filter(isHumanMessage) as BaseMessage[];
  return humanMessages.length;
}

export const isFirstMessage = (record: RecordWithMessages): boolean => {
  if (!record.messages || record.messages.length === 0) {
    return false;
  }
  const humanMessages = record.messages.filter(isHumanMessage) as BaseMessage[];
  return humanMessages.length === 1;
}