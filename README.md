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

1. Run migrations:

```bash
pnpm langgraph-ai-sdk db:migrate # This will create the threads table
```

2. Setup a PostgresSaver to preserve Langgraph state:

```typescript
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";

const checkpointer = new PostgresSaver(pool);
await checkpointer.setup();

export { checkpointer };
```

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

5. (Optional): In your node, tell the LLM about your structured message type (but DO NOT use `llm.withStructuredOutput`, which doesn't stream data):

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

// Stream the response first. The AI SDK will stream this to the frontend
const output = await llm.invoke(prompt);

// Parse structured output afterwards, and attach it as metadata so we can use this to reload
// structured messages from the database
const structuredOutput = structuredMessageSchema.parse(output.content);

return {
  messages: [
    new AIMessage({
      content: output.content,
      response_metadata: structuredOutput, // Attach the structured output as metadata
    }),
  ],
};
```

6. Tell langgraph-ai-sdk about your graph and structured message type:

```typescript
import { LanggraphData, registerGraph } from "@langgraph-ai-sdk/server";

type GraphData = LanggraphData<
  typeof graph, // Tell it about the graph
  StructuredMessageType // Tell it about the structured message type
>;

// Register the graph with the server
registerGraph<GraphData>("answerQuestion", { graph });
```

7. Create any type of server you want, and use the provided functions to stream and fetch history:

```typescript
import { Hono } from "hono";
import {
  streamLanggraph,
  fetchLanggraphHistory,
} from "@langgraph-ai-sdk/server";

const app = new Hono();

app.use("*", myAuthMiddleware);

app.post("/api/chat", streamLanggraph("answerQuestion")); // Use the registered graph name
app.get("/api/chat", fetchLanggraphHistory("answerQuestion")); // Add a get route to fetch graph history
```

8. On your client, the provided hooks will expose the graph state and messages to your UI:

```typescript
import { useLanggraph } from "@langgraph-ai-sdk/client";
import { type LanggraphData } from "./your-shared-types";

function App() {
  // Provide type safety to the hook, you'll automatically get autocompletion for messages and state,
  // including your structured message type
  const { messages, state, status, threadId, error } =
    useLanggraph<LanggraphData>("answerQuestion");

  return (
    <div>
      <Chat messages={messages} />
    </div>
  );
}
```

## Contributing

We'd love to hear from you! Please open an issue or submit a PR if you'd like to contribute to this project.
