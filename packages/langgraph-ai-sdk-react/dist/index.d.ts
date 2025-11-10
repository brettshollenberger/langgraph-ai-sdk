import * as ai0 from "ai";
import { InferState, LanggraphAISDKUIMessage, LanggraphData, LanggraphMessage, LanggraphUIMessage, MessagePart, SimpleLanggraphUIMessage, StatePart } from "langgraph-ai-sdk-types";

//#region src/useLanggraph.d.ts
interface CustomEvent {
  id: string;
  type: string;
  data: any;
}
declare function useLanggraph<TLanggraphData extends LanggraphData<any, any>>({
  api,
  headers,
  getInitialThreadId
}: {
  api?: string;
  headers?: Record<string, string>;
  getInitialThreadId?: () => string | undefined;
}): {
  sendMessage: (message?: (Omit<LanggraphAISDKUIMessage<TLanggraphData>, "id" | "role"> & {
    id?: string | undefined;
    role?: "system" | "user" | "assistant" | undefined;
  } & {
    text?: never;
    files?: never;
    messageId?: string;
  }) | {
    text: string;
    files?: FileList | ai0.FileUIPart[];
    metadata?: unknown;
    parts?: never;
    messageId?: string;
  } | {
    files: FileList | ai0.FileUIPart[];
    metadata?: unknown;
    parts?: never;
    messageId?: string;
  } | undefined, options?: ai0.ChatRequestOptions | undefined) => void;
  messages: SimpleLanggraphUIMessage<TLanggraphData>[];
  state: InferState<TLanggraphData>;
  tools: {
    type: "tool";
    toolCallId: string;
    toolName: string;
    input: Record<string, any>;
    output: Record<string, any> | undefined;
    state: string;
    error: string | undefined;
    id: string;
  }[];
  events: CustomEvent[];
  threadId: string | undefined;
  error: string | null;
  isLoadingHistory: boolean;
  id: string;
  setMessages: (messages: LanggraphAISDKUIMessage<TLanggraphData>[] | ((messages: LanggraphAISDKUIMessage<TLanggraphData>[]) => LanggraphAISDKUIMessage<TLanggraphData>[])) => void;
  regenerate: ({
    messageId,
    ...options
  }?: {
    messageId?: string;
  } & ai0.ChatRequestOptions) => Promise<void>;
  stop: () => Promise<void>;
  resumeStream: (options?: ai0.ChatRequestOptions) => Promise<void>;
  addToolResult: <TOOL extends string>({
    state,
    tool,
    toolCallId,
    output,
    errorText
  }: {
    state?: "output-available";
    tool: TOOL;
    toolCallId: string;
    output: unknown;
    errorText?: never;
  } | {
    state: "output-error";
    tool: TOOL;
    toolCallId: string;
    output?: never;
    errorText: string;
  }) => Promise<void>;
  status: ai0.ChatStatus;
  clearError: () => void;
};
//#endregion
export { type LanggraphMessage, type LanggraphUIMessage, type MessagePart, type StatePart, useLanggraph };