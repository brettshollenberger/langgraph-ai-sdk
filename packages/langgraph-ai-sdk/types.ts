// We want to support:

// 1. Automatically derive the StateType from the Langgraph graph...
// 2. User can define CustomMessageType as generic...
// 3. These two get merged together to create the DATA_PARTS type required by AISDK to create UIMessages custom type:

// export interface UIMessage<
//   METADATA = unknown,
//   DATA_PARTS extends UIDataTypes = UIDataTypes,
//   TOOLS extends UITools = UITools,
// > {
//   /**
// A unique identifier for the message.
//    */
//   id: string;

//   /**
// The role of the message.
//    */
//   role: 'system' | 'user' | 'assistant';

//   /**
// The metadata of the message.
//    */
//   metadata?: METADATA;

//   /**
// The parts of the message. Use this for rendering the message in the UI.

// System messages should be avoided (set the system prompt on the server instead).
// They can have text parts.

// User messages can have text parts and file parts.

// Assistant messages can have text, reasoning, tool invocation, and file parts.
//    */
//   parts: Array<UIMessagePart<DATA_PARTS, TOOLS>>;
// }

// Backend sends down messages EITHER as text data parts:
// export type TextDataParts = { type: "text", text: string };

// Or as structured data parts (this is the CUSTOM MESSAGE TYPE):
// For example, the Hono server defines:

// export const messageMetadataSchema = z.object({
//   intro: z.string().describe('Introduction to the response'),
//   examples: z.array(z.string()).describe('List of examples'),
//   conclusion: z.string().describe('Conclusion of the response'),
// });
// This is a custom message type...