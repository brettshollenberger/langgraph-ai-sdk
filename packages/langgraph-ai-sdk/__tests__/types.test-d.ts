import { expectTypeOf, test } from 'vitest'
import { BaseMessage } from '@langchain/core/messages'
import { StateGraph, Annotation, messagesStateReducer } from '@langchain/langgraph'
import type { UIMessage } from 'ai'
import type {
  ExtractGraphState,
  LanggraphData,
  InferState,
  InferStructuredMessage,
  LanggraphDataParts,
  LanggraphUIMessage
} from '../types.js'

type TextDataPart = { type: 'text'; text: string }
type CustomMessagePart = {
  intro: string
  examples: string[]
  conclusion: string
}

// UIMessage is the frontend version of the message (includes data...)
// But we're going to create our OWN custom type where we separate the message data from the state data (with no data-prefix)
test('UIMessage should infer custom message part type', () => {
  type Message = UIMessage<unknown, CustomMessagePart>

  const message: Message = {
    id: '1',
    role: 'assistant',
    parts: [
      { type: 'data-intro', data: 'intro' },
      { type: 'data-examples', data: ['example'] },
      { type: 'data-conclusion', data: 'conclusion' },
    ],
  }

  // Should allow custom message part structure
  const introPart = message.parts.find(p => p.type === 'data-intro')
  if (introPart?.type === 'data-intro') {
    expectTypeOf(introPart.data).toEqualTypeOf<string>()
  }

  const examplesPart = message.parts.find(p => p.type === 'data-examples')
  if (examplesPart?.type === 'data-examples') {
    expectTypeOf(examplesPart.data).toEqualTypeOf<string[]>()
  }

  const conclusionPart = message.parts.find(p => p.type === 'data-conclusion')
  if (conclusionPart?.type === 'data-conclusion') {
    expectTypeOf(conclusionPart.data).toEqualTypeOf<string>()
  }
})

// User defines: Custom Message format, State format
// Maps through UIMessage -> LanggraphMessage (BaseMessage, AIMessage, HumanMessage)
// On client, extract back out the user's custom message format + state format to return from the hook. Easy.

const GraphAnnotation = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    default: () => [],
    reducer: messagesStateReducer,
  }),
})

const graph = new StateGraph(GraphAnnotation).compile()

test('We can extract the Graph State from the graph itself', () => {
  type GraphState = ExtractGraphState<typeof graph>

  expectTypeOf<GraphState>().toEqualTypeOf<{ messages: BaseMessage[] }>()
})

test('We can combine the graph state and custom message', () => {
  type MyData = LanggraphData<typeof graph, CustomMessagePart>
  const myData: MyData = {
    state: { messages: [] },
    message: {
      intro: 'intro',
      examples: ['example'],
      conclusion: 'conclusion',
    },
  }

  expectTypeOf(myData.state).toEqualTypeOf<{ messages: BaseMessage[] }>()
  expectTypeOf(myData.message).toEqualTypeOf<CustomMessagePart>()
})

test('If we provide no custom message, the expected message type is string', () => {
  type MyData = LanggraphData<typeof graph>
  const myData: MyData = {
    state: { messages: [] },
    message: "Hello world"
  }

  expectTypeOf(myData.state).toEqualTypeOf<{ messages: BaseMessage[] }>()
  expectTypeOf(myData.message).toEqualTypeOf<string>()
})

test('We can grab TState from LanggraphData', () => {
  type MyData = LanggraphData<typeof graph, CustomMessagePart>

  expectTypeOf<InferState<MyData>>().toEqualTypeOf<{ messages: BaseMessage[] }>()
})

test('We can grab TMessage from LanggraphData', () => {
  type MyData = LanggraphData<typeof graph, CustomMessagePart>

  expectTypeOf<InferStructuredMessage<MyData>>().toEqualTypeOf<CustomMessagePart>()
})

test('We can grab string from LanggraphData', () => {
  type MyData = LanggraphData<typeof graph>

  expectTypeOf<InferStructuredMessage<MyData>>().toEqualTypeOf<string>()
})