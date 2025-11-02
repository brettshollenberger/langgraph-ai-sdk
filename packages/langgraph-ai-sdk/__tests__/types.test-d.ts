import { expectTypeOf, test } from 'vitest'
import { BaseMessage } from '@langchain/core/messages'
import { StateGraph, Annotation, messagesStateReducer, CompiledStateGraph } from '@langchain/langgraph'
import type { UIMessage } from 'ai'
import type { Merge } from 'type-fest'

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
type ExtractGraphState<T> = T extends CompiledStateGraph<infer S, any, any, any, any, any, any, any, any> ? S : never

test('We can extract the Graph State from the graph itself', () => {
  type GraphState = ExtractGraphState<typeof graph>

  expectTypeOf<GraphState>().toEqualTypeOf<{ messages: BaseMessage[] }>()
})

export type StructuredMessage = Record<string, unknown>

interface LanggraphData<
    TGraph extends CompiledStateGraph<any, any, any, any, any, any, any, any, any>,
    TCustomMessage = never
> = Merge<
  ExtractGraphState<TGraph>,
  ([TCustomMessage] extends [never] ? {} : TCustomMessage)
>

test('We can combine the graph state and custom message', () => {
  type MyData = LanggraphData<typeof graph, CustomMessagePart>

  expectTypeOf<MyData>().toEqualTypeOf<{ 
    messages: BaseMessage[],
    intro: string,
    examples: string[],
    conclusion: string,
   }>()
})

test('If we provide no custom message, we get the graph state', () => {
  type MyData = LanggraphData<typeof graph>

  expectTypeOf<MyData>().toEqualTypeOf<{ messages: BaseMessage[] }>()
})

type InferLanggraphState<T> = T extends LanggraphData<infer TState> ? TState : never

test('We can grab TState from LanggraphData', () => {
  type MyData = LanggraphData<typeof graph, CustomMessagePart>

  expectTypeOf<InferLanggraphState<MyData>>().toEqualTypeOf<{ messages: BaseMessage[] }>()
})