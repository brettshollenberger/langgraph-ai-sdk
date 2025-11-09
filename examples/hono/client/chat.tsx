import React from 'react';
import { useState, useEffect, useRef } from 'react';
import { Wrapper, ChatInput, Message, ThinkingIndicator } from './components.tsx';
import { type AgentLanggraphData, type SampleLanggraphData } from '../types.ts';
import { useLanggraph } from 'langgraph-ai-sdk-react';

const endpoints = ["graph", "agent"] as const;
type EndpointKey = typeof endpoints[number];

const EndpointConfig: Record<EndpointKey, { api: string; label: string }> = {
  graph: {
    api: '/api/chat',
    label: 'Graph',
  },
  agent: {
    api: '/api/agent/chat',
    label: 'Agent',
  }
}

// Union type for all possible graph data
type AllGraphData = SampleLanggraphData | AgentLanggraphData;

export function LangGraphChat() {
  const [endpoint, setEndpoint] = useState<EndpointKey>("graph");

  // Use union type - messages will be properly typed as the union of both message types
  const { messages, sendMessage, status, state, threadId, tools, error, events, isLoadingHistory } =
    useLanggraph<AllGraphData>({
      api: EndpointConfig[endpoint].api,
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

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (threadId && typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('threadId', threadId);
      window.history.pushState({}, '', url.toString());
    }
  }, [threadId]);

  const [input, setInput] = useState(`We make chatbots`);
  const inputRef = useRef<HTMLInputElement>(null);

  if (isLoadingHistory) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-gray-500">Loading conversation...</div>
      </div>
    );
  }

  const lastMessage = messages.at(-1);
  const isThinking = lastMessage?.state === 'thinking';
  
  const visibleMessages = messages.filter(msg => msg.state !== 'thinking');

  return (
    <Wrapper>
      {/* Endpoint Switcher */}
      <div className="fixed top-4 right-4 z-50 flex gap-2 bg-gray-900 border border-gray-700 rounded-lg p-1">
        {endpoints.map((ep) => (
          <button
            key={ep}
            onClick={() => setEndpoint(ep)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              endpoint === ep
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
            }`}
          >
            {EndpointConfig[ep].label}
          </button>
        ))}
      </div>

      <div className="mb-4 p-4 bg-gray-800 rounded">
        <div className="text-sm text-gray-400 mb-2">State:</div>
        <pre className="text-xs text-green-400">{JSON.stringify(state, null, 2)}</pre>
        <div className="text-sm text-gray-400 mb-2">Events:</div>
        <pre className="text-xs text-green-400">{JSON.stringify(events, null, 2)}</pre>
      </div>
      {visibleMessages.map((message) => (
        <Message
          key={message.id}
          message={message}
          onExampleClick={(text) => {
            setInput(text);
            setTimeout(() => inputRef.current?.focus(), 0);
          }}
        />
      ))}
      {isThinking && (
        <ThinkingIndicator tools={tools} />
      )}
      <div ref={messagesEndRef} />
      <ChatInput
        inputRef={inputRef}
        input={input}
        onChange={(e) => setInput(e.target.value)}
        onSubmit={(e) => {
          e.preventDefault();
          sendMessage({ text: input });
          setInput('');
        }}
      />
    </Wrapper>
  );
}
