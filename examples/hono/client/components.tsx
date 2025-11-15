import type { SimpleLanggraphUIMessage } from 'langgraph-ai-sdk-types';
import type { GraphLanggraphData, AgentLanggraphData } from '../types.ts';
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
  onExampleClick,
}: {
  message: SimpleLanggraphUIMessage<GraphLanggraphData | AgentLanggraphData>;
  onExampleClick?: (text: string) => void;
}) => {
  const isUser = message.role === 'user';
  const isText = message.type === "text";

  const excludedKeys = ['id', 'role', 'type', 'state'];
  const structuredParts = Object.fromEntries(
    Object.entries(message).filter(([k]) => !excludedKeys.includes(k))
  );
  const hasStructuredData = Object.keys(structuredParts).length > 0;

  // Check for specific message types
  const isQuestion = message.type === "question";
  const isMarketingTemplate = message.type === "marketingTemplate";

  return (
    <div className={`flex w-full mb-4 ${
      isUser ? 'justify-end' : 'justify-start'
    }`}>
      <div className={`${
        isMarketingTemplate ? 'max-w-[85%]' : 'max-w-[70%]'
      } rounded-lg p-4 ${
        isUser
          ? 'bg-blue-800 text-white'
          : isMarketingTemplate
          ? 'bg-gradient-to-br from-purple-900 to-indigo-900 text-white border-2 border-purple-400 shadow-2xl'
          : 'bg-gray-600 text-white'
      }`}>
        {/* Special rendering for marketingTemplate */}
        {isMarketingTemplate && hasStructuredData && (
          <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center gap-2 border-b border-purple-400 pb-3">
              <span className="text-2xl">✨</span>
              <div className="font-bold text-xl">Landing Page Copy</div>
              {'tone' in message && (
                <span className="ml-auto text-xs px-2 py-1 bg-purple-700 rounded-full capitalize">
                  {String(message.tone)} tone
                </span>
              )}
            </div>

            {/* Headline */}
            {'headline' in message && (
              <div className="space-y-1">
                <div className="text-xs font-semibold text-purple-300 uppercase tracking-wide">Headline</div>
                <div className="text-2xl font-bold leading-tight">
                  {String(message.headline)}
                </div>
              </div>
            )}

            {/* Subheadline */}
            {'subheadline' in message && message.subheadline && (
              <div className="space-y-1">
                <div className="text-xs font-semibold text-purple-300 uppercase tracking-wide">Subheadline</div>
                <div className="text-lg opacity-90">
                  {String(message.subheadline)}
                </div>
              </div>
            )}

            {/* Value Proposition */}
            {'valueProposition' in message && (
              <div className="space-y-1 bg-purple-800/30 p-3 rounded-lg">
                <div className="text-xs font-semibold text-purple-300 uppercase tracking-wide">Value Proposition</div>
                <div className="text-base font-medium">
                  {String(message.valueProposition)}
                </div>
              </div>
            )}

            {/* Bullet Points */}
            {'bulletPoints' in message && Array.isArray(message.bulletPoints) && message.bulletPoints.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-semibold text-purple-300 uppercase tracking-wide">Key Benefits</div>
                <ul className="space-y-2">
                  {message.bulletPoints.map((point, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-green-400 mt-1">✓</span>
                      <span className="flex-1">{String(point)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* CTA */}
            {'callToAction' in message && (
              <div className="space-y-2">
                <div className="text-xs font-semibold text-purple-300 uppercase tracking-wide">Call to Action</div>
                <div className="bg-gradient-to-r from-green-600 to-green-500 text-white px-6 py-3 rounded-lg font-bold text-center text-lg shadow-lg">
                  {String(message.callToAction)}
                </div>
              </div>
            )}

            {/* Social Proof */}
            {'socialProofSnippet' in message && message.socialProofSnippet && (
              <div className="space-y-1 border-l-4 border-purple-400 pl-3 italic opacity-80">
                <div className="text-xs font-semibold text-purple-300 uppercase tracking-wide">Social Proof</div>
                <div className="text-sm">
                  "{String(message.socialProofSnippet)}"
                </div>
              </div>
            )}
          </div>
        )}

        {/* Special rendering for questions */}
        {isQuestion && hasStructuredData && (
          <div className="space-y-3">
            {Object.entries(structuredParts).map(([key, value], idx) => (
              <div key={idx}>
                {key === 'text' ? (
                  <div className="prose prose-sm prose-invert max-w-none font-medium">
                    <ReactMarkdown>{String(value)}</ReactMarkdown>
                  </div>
                ) : key === 'examples' && Array.isArray(value) ? (
                  <div className="space-y-2 mt-3">
                    <div className="text-xs font-semibold text-blue-300 mb-2">Sample Answers:</div>
                    {value.map((item, i) => (
                      <button
                        key={i}
                        onClick={() => onExampleClick?.(String(item))}
                        className="w-full text-left p-3 bg-gray-700 hover:bg-gray-600 rounded-lg border border-gray-500 transition-colors cursor-pointer text-sm"
                      >
                        <div className="font-medium text-blue-300 text-xs mb-1">Example {i + 1}:</div>
                        <div>{String(item)}</div>
                      </button>
                    ))}
                  </div>
                ) : key === 'conclusion' ? (
                  <div className="mt-3 pt-3 border-t border-gray-500">
                    <div className="prose prose-sm prose-invert max-w-none italic opacity-90">
                      <ReactMarkdown>{String(value)}</ReactMarkdown>
                    </div>
                  </div>
                ) : Array.isArray(value) ? (
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

        {/* Default rendering for other message types */}
        {!isQuestion && !isMarketingTemplate && hasStructuredData && (
          <div className="space-y-3">
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
  inputRef,
  input,
  onChange,
  onSubmit,
}: {
  inputRef?: React.RefObject<HTMLInputElement>;
  input: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSubmit: (e: React.FormEvent) => void;
}) => (
  <form onSubmit={onSubmit} className="fixed bottom-0 w-full max-w-2xl mb-8">
    <div className="flex gap-2">
      <input
        ref={inputRef}
        className="flex-1 p-2 border-2 border-zinc-700 rounded shadow-xl bg-gray-800 text-white"
        value={input}
        placeholder="Say something..."
        onChange={onChange}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            onSubmit(e as any);
          }
        }}
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
