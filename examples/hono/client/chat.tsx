import React from 'react';
import { useState, useEffect, useRef } from 'react';
import { Wrapper, ChatInput, Message } from './components.tsx';
import { type AgentLanggraphData, type GraphLanggraphData } from '../types.ts';
import { useLanggraph } from 'langgraph-ai-sdk-react';

const endpoints = ["graph", "agent"] as const;
type EndpointKey = typeof endpoints[number];

type EndpointOptions = {
  api: string;
  label: string;
  suggestedText: string;
}

const EndpointConfig: Record<EndpointKey, EndpointOptions> = {
  graph: {
    api: '/api/chat',
    label: 'Graph',
    suggestedText: 'What is the capital of France?'
  },
  agent: {
    api: '/api/agent/chat',
    label: 'Agent',
    suggestedText: 'We make chatbots'
  }
}

// Union type for all possible graph data
type AllGraphData = GraphLanggraphData | AgentLanggraphData;

const setThreadGraphType = (threadId: string, graphType: EndpointKey) => {
  localStorage.setItem(`thread-${threadId}`, graphType);
}

const getThreadGraphType = (threadId: string): EndpointKey => {
  return (localStorage.getItem(`thread-${threadId}`) || "agent") as EndpointKey;
}

// Inner component that will be remounted when endpoint changes
function ChatContent({ endpoint }: { endpoint: EndpointKey }) {
  // State for user context
  const [businessType, setBusinessType] = useState<'B2B' | 'B2C' | 'SaaS' | 'Ecommerce' | 'Other'>('SaaS');
  const [urgencyLevel, setUrgencyLevel] = useState<'low' | 'medium' | 'high'>('medium');
  const [experienceLevel, setExperienceLevel] = useState<'beginner' | 'intermediate' | 'expert'>('intermediate');

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

  useEffect(() => {
    if (threadId && typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('threadId', threadId);
      setThreadGraphType(threadId, endpoint);
      window.history.pushState({}, '', url.toString());
    }
  }, [threadId]);;

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const [input, setInput] = useState(EndpointConfig[endpoint].suggestedText);
  const inputRef = useRef<HTMLInputElement>(null);

  if (isLoadingHistory) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-gray-500">Loading conversation...</div>
      </div>
    );
  }

  return (
    <Wrapper>
      {/* User Context Panel - Only show for agent endpoint */}
      {endpoint === 'agent' && (
        <div className="mb-4 p-4 bg-gray-800 rounded-lg border border-gray-700">
          <div className="text-sm font-semibold text-gray-300 mb-3">👤 User Context (sent with each message)</div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Business Type</label>
              <select
                value={businessType}
                onChange={(e) => setBusinessType(e.target.value as any)}
                className="w-full px-2 py-1 text-sm bg-gray-700 text-white rounded border border-gray-600"
              >
                <option value="B2B">B2B</option>
                <option value="B2C">B2C</option>
                <option value="SaaS">SaaS</option>
                <option value="Ecommerce">Ecommerce</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Urgency Level</label>
              <select
                value={urgencyLevel}
                onChange={(e) => setUrgencyLevel(e.target.value as any)}
                className="w-full px-2 py-1 text-sm bg-gray-700 text-white rounded border border-gray-600"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">Experience Level</label>
              <select
                value={experienceLevel}
                onChange={(e) => setExperienceLevel(e.target.value as any)}
                className="w-full px-2 py-1 text-sm bg-gray-700 text-white rounded border border-gray-600"
              >
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="expert">Expert</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* State Debug Panel */}
      <div className="mb-4 p-4 bg-gray-800 rounded">
        <div className="text-sm text-gray-400 mb-2">State:</div>
        <pre className="text-xs text-green-400">{JSON.stringify(state, null, 2)}</pre>
        <div className="text-sm text-gray-400 mb-2 mt-2">Events:</div>
        <pre className="text-xs text-green-400">{JSON.stringify(events, null, 2)}</pre>
      </div>

      {messages.map((message) => (
        <Message
          key={message.id}
          message={message}
          status={status}
          onExampleClick={(text) => {
            setInput(text);
            setTimeout(() => inputRef.current?.focus(), 0);
          }}
        />
      ))}
      <div ref={messagesEndRef} />
      <ChatInput
        inputRef={inputRef}
        input={input}
        onChange={(e) => setInput(e.target.value)}
        onSubmit={(e) => {
          e.preventDefault();
          // Send message with user context for agent endpoint
          if (endpoint === 'agent') {
            sendMessage(input, {
              userContext: {
                businessType,
                urgencyLevel,
                experienceLevel,
              }
            });
          } else {
            sendMessage(input);
          }
          setInput('');
        }}
      />
    </Wrapper>
  );
}

// Outer component that manages endpoint switching
export function LangGraphChat() {
  const params = new URLSearchParams(window.location.search);
  const threadId = params.get('threadId') || '';
  const initialEndpoint = threadId ? getThreadGraphType(threadId) : "agent";
  const [endpoint, setEndpoint] = useState<EndpointKey>(initialEndpoint);

  const handleEndpointChange = (newEndpoint: EndpointKey) => {
    // Navigate to localhost:3000 (remove thread params)
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', window.location.pathname);
    }
    // Set the new endpoint, which will trigger remount via key
    setEndpoint(newEndpoint);
  };

  return (
    <>
      {/* Endpoint Switcher */}
      <div className="fixed top-4 right-4 z-50 flex gap-2 bg-gray-900 border border-gray-700 rounded-lg p-1">
        {endpoints.map((ep) => (
          <button
            key={ep}
            onClick={() => handleEndpointChange(ep satisfies EndpointKey)}
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

      {/* Key prop forces complete remount when endpoint changes */}
      <ChatContent key={endpoint} endpoint={endpoint} />
    </>
  );
}
