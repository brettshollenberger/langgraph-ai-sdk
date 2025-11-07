import React from 'react';
import { useState, useEffect } from 'react';
import { Wrapper, ChatInput, Message } from './components.tsx';
import { type AgentLanggraphData } from '../types.ts';
import { useLanggraph } from 'langgraph-ai-sdk-react';

export function LangGraphChat() {
  const { messages, sendMessage, status, state, threadId, error, events, isLoadingHistory } = useLanggraph<AgentLanggraphData>({
    api: '/api/agent/chat',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer 12345`,
    },
    getInitialThreadId: () => {
      if (typeof window !== 'undefined') {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('threadId') || undefined;
      }
      return undefined;
    }
  });

  useEffect(() => {
    if (threadId && typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('threadId', threadId);
      window.history.pushState({}, '', url.toString());
    }
  }, [threadId]);

  const [input, setInput] = useState(`We make chatbots`);

  if (isLoadingHistory) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-gray-500">Loading conversation...</div>
      </div>
    );
  }

  return (
    <Wrapper>
      <div>
        {status}
      </div>
      <div className="mb-4 p-4 bg-gray-800 rounded">
        <div className="text-sm text-gray-400 mb-2">State:</div>
        <pre className="text-xs text-green-400">{JSON.stringify(state, null, 2)}</pre>
        <div className="text-sm text-gray-400 mb-2">Events:</div>
        <pre className="text-xs text-green-400">{JSON.stringify(events, null, 2)}</pre>
      </div>
      {messages.map((message) => (
        <Message
          key={message.id}
          message={message}
        />
      ))}
      <ChatInput
        input={input}
        onChange={(e) => setInput(e.target.value)}
        onSubmit={(e) => {
          e.preventDefault();
          sendMessage({ text: input })
        }}
      />
    </Wrapper>
  );
}
