# Testing Infrastructure

This document describes the comprehensive testing infrastructure for LangGraph AI SDK.

## Overview

The testing infrastructure provides:

1. **Smart Mock LLM** - Context-aware mock responses with automatic object-to-JSON conversion
2. **Shared Sample Graph** - Reusable graph for both examples and tests
3. **Streaming Tests** - Unit tests for the streaming infrastructure
4. **React Hook Tests** - Unit tests for the useLanggraph React hook

## Mock LLM System

### Basic Usage

```typescript
import { configureResponses, resetLLMConfig } from 'langgraph-ai-sdk/testing';

describe('my graph', () => {
  afterEach(() => {
    resetLLMConfig();
  });

  it('should work', async () => {
    configureResponses({
      'my-graph-name': {
        node1: ['response1', 'response2'],
        node2: [{ intro: 'Hello', conclusion: 'Goodbye' }], // Auto-converted to JSON
      }
    });

    // Run your graph...
  });
});
```

### Auto-Conversion Features

The mock LLM automatically converts objects to properly formatted JSON:

```typescript
configureResponses({
  'my-graph': {
    responseNode: [
      // Object format - automatically converts to ```json...``` format
      {
        intro: 'Introduction text',
        examples: ['ex1', 'ex2'],
        conclusion: 'Final thoughts'
      }
    ]
  }
});

// Becomes: "```json\n{\n  \"intro\": \"Introduction text\",\n  \"examples\": [\"ex1\", \"ex2\"],\n  \"conclusion\": \"Final thoughts\"\n}\n```"
```

**Important**: For nodes using `withStructuredOutput`, provide raw JSON strings instead:

```typescript
configureResponses({
  'my-graph': {
    // For withStructuredOutput - use raw JSON string
    nameProjectNode: ['{"projectName": "My Project"}'],
    // For manual parsing - use object (auto-converts to markdown-wrapped JSON)
    responseNode: [{ intro: 'Hello', conclusion: 'Goodbye' }]
  }
});
```

### Context-Aware Responses

The mock LLM uses `AsyncLocalStorage` to track which node is executing:

```typescript
// Automatically selects the right responses based on:
// 1. Graph name (from config.context.graphName)
// 2. Node name (from config.metadata.langgraph_node)

const graph = createSampleGraph(undefined, 'my-graph-name');
// Each node gets its configured responses automatically
```

## Shared Sample Graph

Located in `src/testing/graphs/`, the sample graph demonstrates a typical LangGraph workflow.

### Graph Structure

```
START → nameProjectNode → responseNode → END
```

**Nodes:**
- **nameProjectNode**: Generates a project name from user message
- **responseNode**: Generates structured responses with intro/examples/conclusion

**State:**
```typescript
{
  messages: BaseMessage[],
  projectName?: string
}
```

**Message Schema:**
```typescript
// Union of simple or structured messages
{
  content: string  // Simple message
} | {
  intro: string,
  examples: string[],
  conclusion: string  // Structured message
}
```

### Using the Sample Graph

```typescript
import { createSampleGraph, sampleMessageSchema } from 'langgraph-ai-sdk/testing';

// In examples
const graph = createSampleGraph(checkpointer, 'default');

// In tests
const graph = createSampleGraph(undefined, 'test-graph-name');
```

## Running Tests

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# UI mode
npm run test:ui
```

## Test Structure

### Streaming Infrastructure Tests

Location: `src/__tests__/stream.test.ts`

Tests cover:
- State updates streaming as `data-state-*` parts
- Message updates streaming as `data-message-*` parts
- Progressive JSON parsing
- Stable ID generation across chunks
- Simple vs. structured message formats

### React Hook Tests

Location: `packages/langgraph-ai-sdk-react/src/__tests__/useLanggraph.test.tsx`

Tests cover:
- History loading on mount
- State extraction from `data-state-*` parts
- Message format transformation
- ThreadId exposure after first submission
- Error handling

## Writing New Tests

### 1. Graph Tests

```typescript
import { configureResponses, createSampleGraph } from 'langgraph-ai-sdk/testing';

it('should process messages correctly', async () => {
  const graphName = 'test-my-feature';

  configureResponses({
    [graphName]: {
      nameProjectNode: ['{"projectName": "Test"}'],
      responseNode: [{ intro: 'Hi', examples: [], conclusion: 'Done' }]
    }
  });

  const graph = createSampleGraph(undefined, graphName);

  const result = await graph.invoke({
    messages: [new HumanMessage('Hello')]
  });

  expect(result.projectName).toBe('Test');
});
```

### 2. Streaming Tests

```typescript
import { createLanggraphUIStream } from '../stream';

it('should stream correctly', async () => {
  configureResponses({ /* ... */ });

  const stream = createLanggraphUIStream({
    graph,
    messages: [new HumanMessage('Test')],
    threadId: 'test-123',
    messageSchema: sampleMessageSchema,
  });

  const chunks: any[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }

  // Get last chunk of each type (progressive streaming)
  const stateChunks = chunks.filter(c => c.type === 'data-state-projectName');
  const lastState = stateChunks[stateChunks.length - 1];

  expect(lastState?.data).toBe('Expected Value');
});
```

### 3. React Hook Tests

```typescript
import { renderHook, waitFor } from '@testing-library/react';
import { useLanggraph } from '../useLanggraph';

it('should load history', async () => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      messages: [/* ... */],
      state: { projectName: 'Test' }
    })
  });

  const { result } = renderHook(() =>
    useLanggraph({ getInitialThreadId: () => 'test-thread' })
  );

  await waitFor(() => {
    expect(result.current.isLoadingHistory).toBe(false);
  });

  expect(result.current.state.projectName).toBe('Test');
});
```

## Best Practices

1. **Always reset mock config** in `afterEach`:
   ```typescript
   afterEach(() => {
     resetLLMConfig();
   });
   ```

2. **Use unique graph names** for each test to avoid conflicts

3. **Handle progressive streaming** by getting the last chunk:
   ```typescript
   const chunks = allChunks.filter(c => c.type === 'data-message-intro');
   const lastChunk = chunks[chunks.length - 1];
   ```

4. **Match response format to node expectations**:
   - `withStructuredOutput`: Raw JSON strings
   - Manual parsing: Objects (auto-converted to ```json...```)

5. **Test both state and message formats** to ensure proper data flow

## Example Test Output

```
✓ should stream state updates as data-state-* parts
✓ should stream structured message parts as data-message-* parts
✓ should handle simple message format without schema
✓ should progressively stream partial JSON responses
✓ should maintain stable IDs across multiple chunks of same part
✓ should return empty state for graph without checkpointer

Test Files  1 passed (1)
Tests  6 passed (6)
```

## Troubleshooting

### "No responses configured" error

Ensure you're calling `configureResponses` before running your graph, and that the graph name and node names match exactly.

### "No checkpointer set" error

Tests use graphs without checkpointers. This is expected for `loadThreadHistory` tests.

### Progressive streaming issues

Remember that streams emit multiple chunks for each part. Always get the last chunk for final values:

```typescript
const introChunks = chunks.filter(c => c.type === 'data-message-intro');
const finalIntro = introChunks[introChunks.length - 1];
```

### JSON parsing errors with withStructuredOutput

Use raw JSON strings, not objects, for nodes using `withStructuredOutput`:

```typescript
// ✗ Wrong
nameProjectNode: [{ projectName: 'Test' }]

// ✓ Correct
nameProjectNode: ['{"projectName": "Test"}']
```
