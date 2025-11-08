import React from 'react';
import { useState, useEffect, useRef } from 'react';
import { Wrapper, ChatInput, Message, ThinkingIndicator } from './components.tsx';
import { type AgentLanggraphData } from '../types.ts';
import { useLanggraph } from 'langgraph-ai-sdk-react';

export function LangGraphChat() {
  const { messages, sendMessage, status, state, threadId, tools, error, events, isLoadingHistory } = useLanggraph<AgentLanggraphData>({
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
