import type { LanggraphUIMessage } from 'langgraph-ai-sdk-react';
import type { MyLanggraphData } from '../types.ts';
import React from 'react';
import ReactMarkdown from 'react-markdown';

export const Wrapper = (props: {
  children: React.ReactNode;
}) => {
  return (
    <div className="flex flex-col w-full max-w-2xl py-24 mx-auto stretch">
      {props.children}
    </div>
  );
};

export const Message = ({
  message,
}: {
  message: LanggraphUIMessage<MyLanggraphData>;
}) => {
  const isUser = message.role === 'user';
  const isText = message.type === "text";
  
  const excludedKeys = ['id', 'role', 'type'];
  const structuredParts = Object.fromEntries(
    Object.entries(message).filter(([k]) => !excludedKeys.includes(k))
  );
  const hasStructuredData = Object.keys(structuredParts).length > 0;

  return (
    <div className={`flex w-full mb-4 ${
      isUser ? 'justify-end' : 'justify-start'
    }`}>
      <div className={`max-w-[70%] rounded-lg p-4 ${
        isUser 
          ? 'bg-blue-800 text-white' 
          : 'bg-gray-600 text-white'
      }`}>
        {hasStructuredData && (
          <div className="space-y-2 mt-2">
            {Object.entries(structuredParts).map(([key, value], idx) => (
              <div key={idx}>
                {Array.isArray(value) ? (
                  <ul className="list-disc pl-5 text-sm">
                    {value.map((item, i) => (
                      <li key={i}>{String(item)}</li>
                    ))}
                  </ul>
                ) : (
                  <div className="prose prose-sm prose-invert max-w-none">
                    <ReactMarkdown>{String(value)}</ReactMarkdown>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export const ThinkingIndicator = ({ tools }: { tools: any[] }) => {
  if (!tools || tools.length === 0) return null;
  
  return (
    <div className="flex w-full mb-4 justify-start">
      <div className="max-w-[70%] rounded-lg p-4 bg-gray-700 text-white">
        <div className="text-xs opacity-70 mb-2">AI is thinking...</div>
        <div className="space-y-2">
          {tools.map((tool, idx) => (
            <div key={idx} className="text-sm">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${
                  tool.state === 'complete' ? 'bg-green-500' :
                  tool.state === 'error' ? 'bg-red-500' :
                  'bg-yellow-500 animate-pulse'
                }`} />
                <span className="font-medium">{tool.toolName}</span>
                <span className="text-xs opacity-70">({tool.state})</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export const ChatInput = ({
  input,
  onChange,
  onSubmit,
}: {
  input: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSubmit: (e: React.FormEvent) => void;
}) => (
  <form onSubmit={onSubmit} className="fixed bottom-0 w-full max-w-2xl mb-8">
    <div className="flex gap-2">
      <input
        className="flex-1 p-2 border-2 border-zinc-700 rounded shadow-xl bg-gray-800 text-white"
        value={input}
        placeholder="Say something..."
        onChange={onChange}
        autoFocus
      />
      <button
        type="submit"
        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded shadow-xl font-medium transition-colors"
      >
        Send
      </button>
    </div>
  </form>
);
