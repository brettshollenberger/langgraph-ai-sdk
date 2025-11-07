import type { LanggraphMessage } from 'langgraph-ai-sdk-react';
import type { MyLanggraphData } from '../types.ts';
import React from 'react';
import ReactMarkdown from 'react-markdown';

export const Wrapper = (props: {
  children: React.ReactNode;
}) => {
  return (
    <div className="flex flex-col w-full max-w-md py-24 mx-auto stretch">
      {props.children}
    </div>
  );
};

export const Message = ({
  message,
}: {
  message: LanggraphMessage<MyLanggraphData>;
}) => {
  const prefix = message.role === 'user' ? 'User: ' : 'AI: ';
  const isText = message.parts.every((part) => part.type === 'text');

  if (isText) {
    const text = message.parts
      .filter((part): part is Extract<typeof part, { type: 'text' }> => part.type === 'text')
      .map((part) => part.text);
    return (
      <div className="prose prose-invert my-6">
        <ReactMarkdown>{prefix + text}</ReactMarkdown>
      </div>
    );
  } else {
    const structuredParts = message.parts;
    
    return (
      <div className="prose prose-invert my-6">
        <div className="font-bold">{prefix}</div>
        {structuredParts.map((part, idx) => {
          if (part.type.startsWith('tool-')) {
            const toolName = part.type.replace('tool-', '');
            const toolPart = part as any;
            
            switch (toolPart.state) {
              case 'input-streaming':
                return (
                  <div key={idx} className="my-2 p-3 bg-yellow-900/30 rounded border border-yellow-600">
                    <div className="text-yellow-400 font-semibold">🔧 {toolName} (streaming)</div>
                    <pre className="text-xs mt-2 overflow-auto">{JSON.stringify(toolPart.input, null, 2)}</pre>
                  </div>
                );
              case 'input-available':
                return (
                  <div key={idx} className="my-2 p-3 bg-blue-900/30 rounded border border-blue-600">
                    <div className="text-blue-400 font-semibold">🔧 {toolName} (executing)</div>
                    <pre className="text-xs mt-2 overflow-auto">{JSON.stringify(toolPart.input, null, 2)}</pre>
                  </div>
                );
              case 'output-available':
                return (
                  <div key={idx} className="my-2 p-3 bg-green-900/30 rounded border border-green-600">
                    <div className="text-green-400 font-semibold">✅ {toolName} (complete)</div>
                    <pre className="text-xs mt-2 overflow-auto">{JSON.stringify(toolPart.output, null, 2)}</pre>
                  </div>
                );
              case 'output-error':
                return (
                  <div key={idx} className="my-2 p-3 bg-red-900/30 rounded border border-red-600">
                    <div className="text-red-400 font-semibold">❌ {toolName} (error)</div>
                    <div className="text-sm mt-2">{toolPart.errorText}</div>
                  </div>
                );
            }
          }
          
          const key = String(part.type);
          const value = 'data' in part ? part.data : '';
          
          return (
            <div key={idx} className="my-2">
              <div className="text-blue-400 font-semibold capitalize">{key}:</div>
              {Array.isArray(value) ? (
                <ul className="list-disc pl-5">
                  {value.map((item, i) => (
                    <li key={i}>{String(item)}</li>
                  ))}
                </ul>
              ) : (
                <ReactMarkdown>{String(value)}</ReactMarkdown>
              )}
            </div>
          );
        })}
      </div>
    );
  }
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
  <form onSubmit={onSubmit}>
    <input
      className="fixed bottom-0 w-full max-w-md p-2 mb-8 border-2 border-zinc-700 rounded shadow-xl bg-gray-800"
      value={input}
      placeholder="Say something..."
      onChange={onChange}
      autoFocus
    />
  </form>
);
