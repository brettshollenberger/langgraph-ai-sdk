# Langgraph AI SDK

This is a collection of tools that enables you to bridge Langgraph + the AI SDK.

Why would you want to do that?

Because Langgraph is great for building complex workflows and agents, but...

1. The Langgraph server sucks.
2. It doesn't let you self-host
3. It doesn't let you extend the server (e.g. auth) without paying for an expensive subscription
4. The dev server is in-memory only (it drops your data when you restart)
5. The production version is closed source
6. It doesn't even let you stream structured messages

## BYO Server

Instead, the Langgraph AI SDK gives you two sets of tools:

1. Backend: Stream state + messages to the client (including structured messages!)
2. Frontend: Receive the stream and render it to the UI

## Getting Started

1. Define a checkpointer (Postgres for production)

```typescript
import { Pool } from "pg";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";

// Create a single pool for both checkpointer and ops
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://localhost/mydb",
});

const checkpointer = new PostgresSaver(pool);
await checkpointer.setup();

export { checkpointer, pool };
```

2. Define your graph:

```typescript
import { StateGraph, Annotation } from "@langchain/langgraph";
import { checkpointer } from "./checkpointer";

const graph = new StateGraph(
  Annotation.Root({
    messages: Annotation<BaseMessage[]>({
      default: () => [],
      reducer: messagesStateReducer,
    }),
    projectName: Annotation<string | undefined>({
      default: () => undefined,
      reducer: (curr, next) => next ?? curr,
    }),
  })
)
  .addNode("nameProjectNode", nameProjectNode) // Send some state
  .addNode("responseNode", responseNode) // Send an AI message
  .addEdge(START, "nameProjectNode")
  .addEdge("nameProjectNode", "responseNode")
  .addEdge("responseNode", END)
  .compile({ checkpointer });
```

3. (Optional): Define a structured message type (if you want your frontend to handle structured messages):

```typescript
import { z } from "zod";

const structuredMessageSchema = z.object({
  intro: z.string().describe("Introduction"),
  examples: z.array(z.string()).describe("Examples"),
  conclusion: z.string().describe("Conclusion"),
});

type StructuredMessageType = z.infer<typeof structuredMessageSchema>;
```

4. In your node, DO NOT use `withStructuredOutput` or `responseFormat` (Langgraph emits these when finished, which makes the streaming choppy). Instead, just tell the model about your response format in the prompt, and we'll handle streaming token-by-token.

```typescript
import { toStructuredMessage } from "langgraph-ai-sdk";

const prompt = `
<task>
    Answer the user's question
</task>

<question>
    ${messages.at(-1).content}
</question>

<output>
    ${structuredMessageSchema.getFormatInstructions()}
</output>`;

// The AI SDK will stream this to the frontend
const message = await llm // Don't use structured output!
  .withConfig({ tags: ["notify"] }) // Attach tags: ["notify"]!
  .invoke(prompt);

// Helper to convert the message to a structured output
const structuredMessage = await toStructuredMessage(message);

return {
  messages: [structuredMessage],
};
```

5. Tell langgraph-ai-sdk about your state and structured message schemas (for intellisense and type safety):

```typescript
import {
  LanggraphData,
  registerGraph,
  ExtractGraphState,
} from "@langgraph-ai-sdk/server";

export type GraphData = LanggraphData<
  ExtractGraphState<typeof graph>,
  typeof structuredMessageSchema
>;
```

You can also use MULTIPLE schemas, if your agent may emit different types of structured messages:

```typescript
const messageWithExamples = z.object({
  type: z.literal("intro"),
  intro: z.string(),
  examples: z.array(z.string()),
  conclusion: z.string(),
});

const marketingTemplateSchema = z.object({
  type: z.literal("marketingTemplate"),
  headline: z.string().describe("Compelling headline that grabs attention"),
  subheadline: z
    .string()
    .optional()
    .describe("Supporting subheadline that expands on the main headline"),
  valueProposition: z
    .string()
    .describe("Clear statement of what makes this business unique"),
  bulletPoints: z
    .array(z.string())
    .optional()
    .describe("3-5 key benefits or features to highlight"),
});

const messageSchemas = [messageWithExamples, marketingTemplateSchema] as const;
export type GraphData = LanggraphData<
  ExtractGraphState<typeof graph>,
  (typeof messageSchemas)[number] // Union of all schemas, your frontend will automatically handle the type inference
>;
```

6. BYO server! We'll handle the streaming

```typescript
import { Hono } from "hono";
import { streamLanggraph, fetchLanggraphHistory } from "langgraph-ai-sdk";

const app = new Hono();

app.use("*", myAuthMiddleware);

// Custom POST endpoint with parsed data
app.post("/api/chat", async (c) => {
  const { messages, threadId, state } = await c.req.json();

  return streamLanggraph<GraphData>({
    graph,
    messageSchema: structuredMessageSchema,
    messages,
    threadId,
    state,
  });
});

// Custom GET endpoint
app.get("/api/chat", async (c) => {
  const threadId = c.req.query("threadId") || "";

  return fetchLanggraphHistory<GraphData>({
    graph,
    messageSchema: structuredMessageSchema,
    threadId,
  });
});
```

7. On your client, the provided hooks will expose the graph state, tool calls, and messages to your UI:

```typescript
import { useLanggraph } from "langgraph-ai-sdk-react";
import { type LanggraphData } from "./your-shared-types";

function App() {
  // Provide type safety to the hook, you'll automatically get autocompletion for messages and state,
  // including your structured message type
  const { messages, state, tools, sendMessage, status, threadId, error } =
    useLanggraph<GraphData>({
      api: "/api/chat", // What endpoint has the graph?
      headers: {
        "Content-Type": "application/json", // Any auth headers you may need
        Authorization: `Bearer 12345`,
      },
      getInitialThreadId: () => {
        // If the URL or other source has an initial threadId, use it to load the graph history
        if (typeof window !== "undefined") {
          const urlParams = new URLSearchParams(window.location.search);
          return urlParams.get("threadId") || undefined;
        }
        return undefined;
      },
    });

  return (
    <Wrapper>
      <div className="mb-4 p-4 bg-gray-800 rounded">
        <div className="text-sm text-gray-400 mb-2">State:</div>
        <pre className="text-xs text-green-400">
          {JSON.stringify(state, null, 2)}
        </pre>
      </div>
      {messages.map((message) => (
        <Message key={message.id} message={message} />
      ))}
      <ChatInput
        input={input}
        onChange={(e) => setInput(e.target.value)}
        onSubmit={(e) => {
          e.preventDefault();
          // You can pass not only the message, but
          // any state data you want to the graph
          sendMessage(input, {
            businessType: "b2b",
            urgencyLevel: "high",
            experienceLevel: "beginner",
          });
        }}
      />
    </Wrapper>
  );
}
```

8. (Optional): You can write custom events to the graph state, and get them on the frontend

For example, in your node, you can emit custom events:

```typescript
const myNode = (state: StateType, config: LangGraphRunnableConfig) => {
  let task = { name: "Answering the user's question" };

  config.writer({
    id: task.id,
    event: "NOTIFY_TASK_START",
    task, // Any extra data properties you sent will be emitted as event.data
  });

  llm.invoke(
    "<task>Answer the user's question</task> <question>${state.messages.at(-1).content}</question>"
  );

  config.writer({
    id: task.id,
    event: "NOTIFY_TASK_COMPLETE",
    task,
  });
  return {};
};
```

9. (Optional): Expose custom events via the frontend hooks:

```typescript
const { events } = useLanggraph<GraphData>(...);

// Show the user what tasks the AI is currently working on
```

## Agent Example

Using an agent is exactly the same as using a workflow, the only thing you need to add is:

1. Ensure you attach tags: "notify" to the LLM
2. Pass your schema to the agent as `responseFormat`:

```typescript
export const brainstormAgent = async (
  state: BrainstormGraphState,
  config?: LangGraphRunnableConfig
): Promise<Partial<BrainstormGraphState>> => {
  const prompt = await getPrompt(state, config);

  // Add tools to the agent, these will be streamed to the frontend
  const tools = [SaveAnswersTool(state, config)];

  // Add tag: notify to ensure we stream messages to the client
  const llm = getLLM().withConfig({ tags: ["notify"] });

  const agent = await createAgent({
    model: llm,
    tools,
    systemPrompt: prompt,
    // responseFormat: questionSchema, // DO NOT USE structured output with agents! The streaming will be choppy!
  });

  const updatedState = await agent.invoke(state as any, config);

  // Instead, use the toStructuredMessage helper to
  // convert the last AIMessage to a structured message - you get the
  // structured message AND the streaming will be smooth on the frontend!
  const aiMessage = toStructuredMessage(lastAIMessage(updatedState));

  return {
    messages: [...(state.messages || []), aiMessage],
  };
};
```

## Tool Calls

When using agents, the agent may be running tools, but not yet producing messages. You can illustrate this either by showing tool calls, or a thinking indicator.

```typescript
const { tools } = useLanggraph<GraphData>(...);

return (
  <div className="flex w-full mb-4 justify-start">
    <div className="max-w-[70%] rounded-lg p-4 bg-gray-700 text-white">
      <div className="text-xs opacity-70 mb-2">AI is thinking...</div>
      <div className="space-y-2">
        {tools.map((tool, idx) => (
          <div key={idx} className="text-sm">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${
                tool.state === 'complete' ? 'bg-green-500' :
                tool.state === 'error' ? 'bg-red-500' :
                'bg-yellow-500 animate-pulse'
              }`} />
              <span className="font-medium">{tool.toolName}</span>
              <span className="text-xs opacity-70">({tool.state})</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
);
```

## Thinking Indicator

```typescript
const { messages } = useLanggraph<GraphData>(...);

const latestAIMessage = messages.filter(msg => msg.type === "assitant").at(-1);
const isThinking = latestAIMessage?.state === "thinking";

return (
  <>
    {isThinking && <ThinkingIndicator />}
    {messages.map((message) => (
      <Message key={message.id} message={message} />
    ))}
  </>
)
```

## Contributing

We'd love to hear from you! Please open an issue or submit a PR if you'd like to contribute to this project.

## Running Tests

```bash
pnpm test
```

## Local Development

```bash
pnpm run dev:watch # watch for changes and rebuild
cd examples/hono
pnpm run dev # run the hono server to test changes in the UI
```

## Releasing

```bash
pnpm release:patch
pnpm release:minor
pnpm release:major
```
