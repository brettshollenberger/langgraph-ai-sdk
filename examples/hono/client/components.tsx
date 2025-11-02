// import type { FrontendMessage, MessageMetadata, FrontendMessagePart } from '../api/chat.ts';
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
  message: FrontendMessage<MessageMetadata>;
}) => {
  const prefix = message.role === 'user' ? 'User: ' : 'AI: ';
  const isText = message.parts.every((part) => part.type === 'text');

  if (isText) {
    const text = message.parts
      .filter((part) => part.type === 'text')
      .map((part) => part.text);
    return (
      <div className="prose prose-invert my-6">
        <ReactMarkdown>{prefix + text}</ReactMarkdown>
      </div>
    );
  } else {
    const structuredParts = message.parts.filter((part): part is Exclude<FrontendMessagePart<MessageMetadata>, { type: 'text' }> => part.type !== 'text');
    
    return (
      <div className="prose prose-invert my-6">
        <div className="font-bold">{prefix}</div>
        {structuredParts.map((part, idx) => {
          const key = String(part.type);
          const value = part.data;
          
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
