import type { LanggraphUIMessage } from 'langgraph-ai-sdk-react';
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

const isTool = (part: LanggraphUIMessage<MyLanggraphData>) => part.type === 'tool'; 
const isText = (part: LanggraphUIMessage<MyLanggraphData>) => part.type === 'text';
const isStructured = (part: LanggraphUIMessage<MyLanggraphData>) => !isTool(part) && !isText(part);

export const Message = ({
  message,
}: {
  message: LanggraphUIMessage<MyLanggraphData>;
}) => {
  const prefix = message.role === 'user' ? 'User: ' : 'AI: ';
  const isText = message.type === "text"

  if (isText) {
    return (
      <div className="prose prose-invert my-6">
        <ReactMarkdown>{message.text}</ReactMarkdown>
      </div>
    );
  } else {
    const structuredParts = Object.fromEntries(Object.entries(message).filter(([k]) => k !== 'type'))
    
    return (
      <div className="prose prose-invert my-6">
        <div className="font-bold">{prefix}</div>
        {Object.entries(structuredParts).map(([key, value], idx) => {
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
  <form onSubmit={onSubmit} className="fixed bottom-0 w-full max-w-md mb-8">
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
