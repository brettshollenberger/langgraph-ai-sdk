import React from 'react';
import { useState, useEffect, useRef } from 'react';
import { Wrapper, ChatInput, Message } from './components.tsx';
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
  console.log(tools)

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

  if (isLoadingHistory) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-gray-500">Loading conversation...</div>
      </div>
    );
  }

        // {tools && tools.map((part, idx) => {
        //   const key = String(part.type);
        //   const toolName = 'toolName' in part ? part.toolName : '';
        //   const toolCallId = 'toolCallId' in part ? part.toolCallId : '';
        //   const input = 'input' in part ? part.input : '';
        //   const output = 'output' in part ? part.output : '';
        //   const state = 'state' in part ? part.state : '';
          
        //   return (
        //     <div key={idx} className="my-2">
        //       <div className="text-blue-400 font-semibold capitalize">{toolName}:</div>
        //       <div>{String(state)}</div>
        //     </div>
        //   );
        // })}
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
      <div ref={messagesEndRef} />
      <ChatInput
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
