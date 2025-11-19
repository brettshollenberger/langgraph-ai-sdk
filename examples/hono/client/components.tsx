import type { AppMessage } from '../types.ts';
import type { MessageWithBlocks, MessageBlock } from 'langgraph-ai-sdk-types';
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

const BlockRenderer = ({ block }: { block: MessageBlock<any> }) => {
  switch (block.type) {
    case 'text':
      return (
        <div className="prose prose-sm prose-invert max-w-none">
          <ReactMarkdown>{block.text}</ReactMarkdown>
        </div>
      );
    
    case 'structured':
      const data = block.data;
      const isQuestion = 'text' in data && 'examples' in data;
      const isMarketingTemplate = 'headline' in data && 'callToAction' in data;
      
      if (isMarketingTemplate) {
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-2 border-b border-purple-400 pb-3">
              <span className="text-2xl">✨</span>
              <div className="font-bold text-xl">Landing Page Copy</div>
              {'tone' in data && (
                <span className="ml-auto text-xs px-2 py-1 bg-purple-700 rounded-full capitalize">
                  {String(data.tone)} tone
                </span>
              )}
            </div>
            {'headline' in data && (
              <div className="space-y-1">
                <div className="text-xs font-semibold text-purple-300 uppercase tracking-wide">Headline</div>
                <div className="text-2xl font-bold leading-tight">{String(data.headline)}</div>
              </div>
            )}
            {'subheadline' in data && data.subheadline && (
              <div className="space-y-1">
                <div className="text-xs font-semibold text-purple-300 uppercase tracking-wide">Subheadline</div>
                <div className="text-lg opacity-90">{String(data.subheadline)}</div>
              </div>
            )}
            {'valueProposition' in data && (
              <div className="space-y-1 bg-purple-800/30 p-3 rounded-lg">
                <div className="text-xs font-semibold text-purple-300 uppercase tracking-wide">Value Proposition</div>
                <div className="text-base font-medium">{String(data.valueProposition)}</div>
              </div>
            )}
            {'bulletPoints' in data && Array.isArray(data.bulletPoints) && data.bulletPoints.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-semibold text-purple-300 uppercase tracking-wide">Key Benefits</div>
                <ul className="space-y-2">
                  {data.bulletPoints.map((point: any, i: number) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-green-400 mt-1">✓</span>
                      <span className="flex-1">{String(point)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {'callToAction' in data && (
              <div className="space-y-2">
                <div className="text-xs font-semibold text-purple-300 uppercase tracking-wide">Call to Action</div>
                <div className="bg-gradient-to-r from-green-600 to-green-500 text-white px-6 py-3 rounded-lg font-bold text-center text-lg shadow-lg">
                  {String(data.callToAction)}
                </div>
              </div>
            )}
            {'socialProofSnippet' in data && data.socialProofSnippet && (
              <div className="space-y-1 border-l-4 border-purple-400 pl-3 italic opacity-80">
                <div className="text-xs font-semibold text-purple-300 uppercase tracking-wide">Social Proof</div>
                <div className="text-sm">"{String(data.socialProofSnippet)}"</div>
              </div>
            )}
          </div>
        );
      }
      
      if (isQuestion) {
        return (
          <div className="space-y-3">
            {'text' in data && (
              <div className="prose prose-sm prose-invert max-w-none font-medium">
                <ReactMarkdown>{String(data.text)}</ReactMarkdown>
              </div>
            )}
            {'examples' in data && Array.isArray(data.examples) && (
              <div className="space-y-2 mt-3">
                <div className="text-xs font-semibold text-blue-300 mb-2">Sample Answers:</div>
                {data.examples.map((item: any, i: number) => (
                  <div
                    key={i}
                    className="w-full text-left p-3 bg-gray-700 rounded-lg border border-gray-500 text-sm"
                  >
                    <div className="font-medium text-blue-300 text-xs mb-1">Example {i + 1}:</div>
                    <div>{String(item)}</div>
                  </div>
                ))}
              </div>
            )}
            {'conclusion' in data && (
              <div className="mt-3 pt-3 border-t border-gray-500">
                <div className="prose prose-sm prose-invert max-w-none italic opacity-90">
                  <ReactMarkdown>{String(data.conclusion)}</ReactMarkdown>
                </div>
              </div>
            )}
          </div>
        );
      }
      
      return (
        <div className="space-y-2">
          {Object.entries(data).map(([key, value], idx) => (
            <div key={idx}>
              <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">{key}</div>
              {Array.isArray(value) ? (
                <ul className="list-disc pl-5 text-sm">
                  {value.map((item: any, i: number) => (
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
      );
    
    case 'tool_call':
      return (
        <div className="text-xs p-3 bg-gray-700 rounded border border-gray-600">
          <div className="flex items-center gap-2 mb-2">
            <div className={`w-2 h-2 rounded-full ${
              block.state === 'complete' ? 'bg-green-500' :
              block.state === 'error' ? 'bg-red-500' :
              'bg-yellow-500'
            }`} />
            <span className="font-semibold">🔧 {block.toolName}</span>
            <span className="text-gray-400">({block.state})</span>
          </div>
          {block.output && (
            <div className="mt-2 text-xs">
              <div className="text-gray-400">Result:</div>
              <pre className="mt-1 text-green-400 overflow-x-auto">{JSON.stringify(block.output, null, 2)}</pre>
            </div>
          )}
          {block.errorText && (
            <div className="mt-2 text-red-400 text-xs">
              Error: {block.errorText}
            </div>
          )}
        </div>
      );
    
    case 'reasoning':
      return (
        <div className="text-xs p-3 bg-blue-900/30 rounded border border-blue-700 italic">
          <div className="font-semibold mb-1">💭 Reasoning:</div>
          <div className="opacity-90">{block.text}</div>
        </div>
      );
    
    default:
      return null;
  }
};

export const Message = ({
  message,
  onExampleClick,
}: {
  message: MessageWithBlocks<any>;
  onExampleClick?: (text: string) => void;
}) => {
  const isUser = message.role === 'user';
  
  const structuredBlocks = message.blocks.filter(b => b.type === 'structured');
  const isMarketingTemplate = structuredBlocks.some(b => 
    b.type === 'structured' && 'headline' in b.data && 'callToAction' in b.data
  );

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
        <div className="space-y-3">
          {message.blocks.map((block) => (
            <BlockRenderer key={block.id} block={block} />
          ))}
        </div>
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
