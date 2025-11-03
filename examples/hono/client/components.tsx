import type { LanggraphMessage } from '@langgraph-ai-sdk/types';
import type { LanggraphChatData } from '../types.ts';
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
  message: LanggraphMessage<LanggraphChatData>;
}) => {
  const prefix = message.role === 'user' ? 'User: ' : 'AI: ';
  const isText = message.type === 'simple';

  if (isText) {
    const text = message.text;
    return (
      <div className="prose prose-invert my-6">
        <ReactMarkdown>{prefix + text}</ReactMarkdown>
      </div>
    );
  } else {
    const structuredParts = message.data;
    
    if (!structuredParts.type) {
      return (
        <div className="prose prose-invert my-6">
        </div>
      );
    }

    if (structuredParts.type === 'plain') {
      return (
        <div className="prose prose-invert my-6">
          <ReactMarkdown>{prefix + structuredParts.content}</ReactMarkdown>
        </div>
      );
    }

    if (structuredParts.type === 'structured') {
      return (
        <div className="prose prose-invert my-6">
          <div className="font-bold">{prefix}</div>
            <div key={0} className="my-2">
              <div className="text-blue-400 font-semibold capitalize">{structuredParts.intro}</div>
              {
                structuredParts.examples && (
                  <ul className="list-disc pl-5">
                    {structuredParts.examples.map((example, i) => (
                      <li key={i}>{String(example)}</li>
                    ))}
                  </ul>
                )
              }
              <div className="text-blue-400 font-semibold capitalize">{structuredParts.conclusion}</div>
            </div>
          </div>
        );
      }
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
