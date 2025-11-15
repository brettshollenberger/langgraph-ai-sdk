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

1. Run Migrations:

```bash
DATABASE_URL="postgresql://user:password@localhost:5432/your_database" pnpm langgraph:db:migrate
```

This will create both the threads table and LangGraph's checkpoint tables.

2. Initialize the library with your database connection:

```typescript
import { Pool } from "pg";
import { initializeLanggraph } from "langgraph-ai-sdk";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";

// Create a single pool for both checkpointer and ops
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://localhost/mydb",
});

// Initialize the library (required for ops functions like ensureThread)
initializeLanggraph({ pool });

// Use the same pool for the LangGraph checkpointer
const checkpointer = new PostgresSaver(pool);
await checkpointer.setup();

export { checkpointer, pool };
```

**Important:** You must call `initializeLanggraph({ pool })` before using any API functions. This ensures a single database connection is used throughout your application.

3. Define your graph:

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

4. (Optional): Define a structured message type:

```typescript
import { z } from "zod";

const structuredMessageSchema = z.object({
  intro: z.string().describe("Introduction"),
  examples: z.array(z.string()).describe("Examples"),
  conclusion: z.string().describe("Conclusion"),
});

type StructuredMessageType = z.infer<typeof structuredMessageSchema>;
```

5. In your node, use `llm.withStructuredOutput` to emit structured output:

```typescript
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
const structuredOutput = await llm
  .withStructuredOutput(structuredMessageSchema)
  .withConfig({ tags: ["notify"] }) // Attach tags: ["notify"]!
  .invoke(prompt);

return {
  messages: [
    new AIMessage({
      content: JSON.stringify(structuredOutput),
      response_metadata: structuredOutput, // Attach the structured output as metadata
    }),
  ],
};
```

6. Tell langgraph-ai-sdk about your state and structured message schemas:

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

// Register the graph with the server
registerGraph<GraphData>("answerQuestion", { graph });
```

7. Create any type of server you want, and use the provided functions to stream and fetch history:

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

8. On your client, the provided hooks will expose the graph state, tool calls, and messages to your UI:

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
          sendMessage({ text: input });
        }}
      />
    </Wrapper>
  );
}
```

9. (Optional): Expose any custom events you want via the Langgraph writer:

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

10. (Optional): Expose custom events via the frontend hooks:

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
    responseFormat: questionSchema,
  });

  const updatedState = await agent.invoke(state as any, config);
  const structuredResponse = updatedState.structuredResponse;

  const aiMessage = new AIMessage({
    content: JSON.stringify(structuredResponse, null, 2),
    response_metadata: structuredResponse,
  });

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
