'use client';

import React, { useState, useEffect } from 'react';
import { speak, stop, isReading } from '@/utils/textToSpeech';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: Date;
  mediaFile?: File;
  isStreaming?: boolean;
  mediaType?: 'image' | 'audio' | 'video';
  mediaUrl?: string;
  error?: string;
  reasoning_content?: string;
}

interface ChatMessageProps {
  message: Message;
  onDelete?: () => void;
}

const ChatMessage: React.FC<ChatMessageProps> = ({ message, onDelete }) => {
  const isUser = message.role === 'user';
  const [mediaError, setMediaError] = useState(false);
  const [showDeleteButton, setShowDeleteButton] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isReadingCurrent, setIsReadingCurrent] = useState(false);
  
  // 当组件卸载时停止语音播放
  useEffect(() => {
    return () => {
      if (isPlaying) {
        stop();
      }
    };
  }, [isPlaying]);
  
  const renderMedia = () => {
    // 如果有mediaFile对象，直接使用该对象创建URL
    if (message.mediaFile) {
      const mediaType = message.mediaFile.type.split('/')[0];
      const url = URL.createObjectURL(message.mediaFile);
      
      switch (mediaType) {
        case 'image':
          return (
            <div className="mt-2">
              <img 
                src={url} 
                alt="用户上传的图片" 
                className="max-w-full rounded-lg max-h-64 object-contain" 
                onError={() => setMediaError(true)}
              />
            </div>
          );
        case 'video':
          return (
            <div className="mt-2">
              <video 
                src={url} 
                controls 
                className="max-w-full rounded-lg max-h-64"
                onError={() => setMediaError(true)}
              />
            </div>
          );
        case 'audio':
          return (
            <div className="mt-2">
              <audio 
                src={url} 
                controls 
                className="max-w-full"
                onError={() => setMediaError(true)}
              />
            </div>
          );
        default:
          return (
            <div className="mt-2 text-sm text-gray-400">
              [上传的文件: {message.mediaFile.name}]
            </div>
          );
      }
    }
    // 如果有mediaUrl和mediaType，使用这些信息显示媒体预览
    else if (message.mediaUrl && message.mediaType) {
      switch (message.mediaType) {
        case 'image':
          return (
            <div className="mt-2">
              <img 
                src={message.mediaUrl} 
                alt="用户上传的图片" 
                className="max-w-full rounded-lg max-h-64 object-contain" 
                onError={() => setMediaError(true)}
              />
            </div>
          );
        case 'video':
          return (
            <div className="mt-2">
              <video 
                src={message.mediaUrl} 
                controls 
                className="max-w-full rounded-lg max-h-64"
                onError={() => setMediaError(true)}
              />
            </div>
          );
        case 'audio':
          return (
            <div className="mt-2">
              <audio 
                src={message.mediaUrl} 
                controls 
                className="max-w-full"
                onError={() => setMediaError(true)}
              />
            </div>
          );
        default:
          return null;
      }
    }
    
    return null;
  };
  
  // 处理文本朗读功能
  const handleTextToSpeech = () => {
    if (isReading()) {
      stop();
      setIsPlaying(false);
      setIsReadingCurrent(false);
    } else if (canTextToSpeech()) {
      speak(message.content || '');
      setIsPlaying(true);
      setIsReadingCurrent(true);
    }
  };
  
  // 判断消息是否适合朗读（纯文本或较短）
  const canTextToSpeech = () => {
    return message.content && message.content.length > 0 && message.content.length < 5000;
  };
  
  const hasUnsupportedMedia = !message.mediaFile && !message.mediaUrl;
  
  // 复制文本到剪贴板
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
      .then(() => {
        alert('已复制到剪贴板');
      })
      .catch(err => {
        console.error('无法复制文本: ', err);
      });
  };

  return (
    <div 
      className={`flex w-full my-2 ${isUser ? 'justify-end' : 'justify-start'}`}
      onMouseEnter={() => setShowDeleteButton(true)}
      onMouseLeave={() => setShowDeleteButton(false)}
    >
      {/* 用户头像 - 仅在用户消息时显示在右侧 */}
      {isUser && (
        <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white flex-shrink-0 ml-2 self-start mt-2">
          <span className="text-sm">您</span>
        </div>
      )}
      
      <div 
        key={message.id} 
        className={`p-4 rounded-lg ${
          message.role === 'user' 
            ? 'bg-blue-100 text-blue-900 mr-2' 
            : 'bg-violet-100 text-violet-900 ml-2'
        } ${
          message.error ? 'border border-red-300' : ''
        } relative group max-w-3xl`}
        data-message="true"
        data-sender={message.role}
        role="article"
        aria-label={`${message.role === 'user' ? '您的消息' : '助手的回复'}`}
      >
        {/* 删除按钮 */}
        <button
          onClick={onDelete}
          className="absolute top-2 right-2 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
          aria-label="删除此消息"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        
        <div className="flex-1 overflow-hidden">
          {/* 显示用户上传的媒体文件预览 */}
          {isUser && renderMedia()}
          
          {/* 显示AI回复中的媒体内容 */}
          {!isUser && message.mediaType === 'image' && message.mediaUrl && (
            <div className="mb-2">
              <img 
                src={message.mediaUrl} 
                alt="附件图片" 
                className="max-w-full rounded-lg max-h-96 object-contain"
                loading="lazy"
              />
            </div>
          )}
          
          {!isUser && message.mediaType === 'video' && message.mediaUrl && (
            <div className="mb-2">
              <video 
                src={message.mediaUrl} 
                controls 
                className="max-w-full rounded-lg max-h-96"
                aria-label="视频附件"
              ></video>
            </div>
          )}
          
          {!isUser && message.mediaType === 'audio' && message.mediaUrl && (
            <div className="mb-2">
              <audio 
                src={message.mediaUrl} 
                controls 
                className="w-full"
                aria-label="音频附件"
              ></audio>
            </div>
          )}
          
          {/* 思考过程展示 - 仅对助手消息显示 */}
          {!isUser && message.reasoning_content && (
            <div className="mb-3 p-3 bg-violet-50 rounded-md border border-violet-200">
              <details>
                <summary className="cursor-pointer text-sm font-medium text-violet-700 mb-1">
                  思考过程 💭
                </summary>
                <div className="mt-2 text-sm text-gray-700 whitespace-pre-wrap">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      // 自定义代码块的样式
                      code({node, inline, className, children, ...props}: any) {
                        return !inline ? (
                          <pre className="bg-gray-100 p-2 rounded-md overflow-x-auto">
                            <code className={className}>{children}</code>
                          </pre>
                        ) : (
                          <code className="bg-gray-100 px-1 py-0.5 rounded text-sm">{children}</code>
                        );
                      }
                    }}
                  >
                    {message.reasoning_content}
                  </ReactMarkdown>
                </div>
              </details>
            </div>
          )}
          
          {/* 文本内容 */}
          {!message.isStreaming && message.content && (
            <div className="prose prose-blue max-w-none prose-pre:bg-gray-100 dark:prose-pre:bg-gray-800 prose-pre:text-sm">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  // @ts-ignore - react-markdown types are not properly defined
                  code({node, inline, className, children}) {
                    const match = /language-(\w+)/.exec(className || '');
                    return !inline ? (
                      <div className="relative">
                        <button
                          onClick={() => copyToClipboard(String(children))}
                          className="absolute top-1 right-1 bg-gray-100 p-1 rounded text-xs hover:bg-gray-200"
                          aria-label="复制代码"
                        >
                          复制
                        </button>
                        <pre>
                          <code className={match ? `language-${match[1]}` : ''}>
                            {children}
                          </code>
                        </pre>
                      </div>
                    ) : (
                      <code>
                        {children}
                      </code>
                    );
                  },
                }}
              >
                {message.content}
              </ReactMarkdown>
            </div>
          )}
          
          {/* 错误消息 */}
          {message.error && (
            <div className="text-red-500 text-sm mt-2">
              发生错误: {message.error}
            </div>
          )}
        </div>
        
        {/* 朗读按钮 - 仅对助手消息显示 */}
        {!isUser && canTextToSpeech() && (
          <button
            onClick={handleTextToSpeech}
            className="ml-2 p-2 rounded-full hover:bg-violet-200 transition-colors"
            aria-label={isReadingCurrent ? "停止朗读" : "朗读此消息"}
            aria-pressed={isReadingCurrent}
          >
            {isReadingCurrent ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-violet-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-violet-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              </svg>
            )}
          </button>
        )}
      </div>
      
      {/* 助手头像 - 仅在助手消息时显示在左侧 */}
      {!isUser && (
        <div className="w-8 h-8 rounded-full bg-violet-500 flex items-center justify-center text-white flex-shrink-0 mr-2 self-start mt-2">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        </div>
      )}
    </div>
  );
};

export default ChatMessage; 