import * as ai0 from "ai";
import { InferState, LanggraphDataBase, LanggraphMessage, LanggraphMessage as LanggraphMessage$1, LanggraphUIMessage, LanggraphUIMessage as LanggraphUIMessage$1, MessagePart, StatePart } from "langgraph-ai-sdk-types";

//#region src/useLanggraph.d.ts
interface CustomEvent {
  id: string;
  type: string;
  data: any;
}
declare function useLanggraph<TLanggraphData extends LanggraphDataBase<any, any>>({
  api,
  headers,
  getInitialThreadId
}: {
  api?: string;
  headers?: Record<string, string>;
  getInitialThreadId?: () => string | undefined;
}): {
  sendMessage: (message?: (Omit<LanggraphUIMessage$1<TLanggraphData>, "id" | "role"> & {
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
  messages: LanggraphMessage$1<TLanggraphData>[];
  state: Partial<InferState<TLanggraphData>>;
  events: CustomEvent[];
  threadId: string | undefined;
  error: string | null;
  isLoadingHistory: boolean;
  id: string;
  setMessages: (messages: LanggraphUIMessage$1<TLanggraphData>[] | ((messages: LanggraphUIMessage$1<TLanggraphData>[]) => LanggraphUIMessage$1<TLanggraphData>[])) => void;
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