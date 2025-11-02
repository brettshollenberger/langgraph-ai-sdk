import { expectTypeOf, test } from 'vitest'
import type { UIMessage } from 'ai'

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
