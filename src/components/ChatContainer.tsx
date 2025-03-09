'use client';

import { useState, useRef, useEffect } from 'react';
import ChatMessage, { Message } from './ChatMessage';
import ChatInput from './ChatInput';
import Greeting from './Greeting';
import { 
  getFileType, 
  sendTextMessage, 
  ensureAbsoluteUrl, 
  fileToBase64, 
  sendMultiModalMessage,
  sendTextToDeepSeek,
  analyzeMediaWithDeepSeek
} from '@/utils/api';
import Typography from '@/components/Typography';
import { PlusCircleIcon } from '@heroicons/react/24/outline';
import { v4 as uuidv4 } from 'uuid';
import { speak, stop } from '@/utils/textToSpeech';
import AccessibilityNavigation from './AccessibilityNavigation';

// 根据时间获取问候语
const getGreetingByTime = (): string => {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) {
    return '早上好';
  } else if (hour >= 12 && hour < 18) {
    return '下午好';
  } else {
    return '晚上好';
  }
};

interface ChatHistoryItem {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
}

// 自动朗读设置
const AUTO_TTS_STORAGE_KEY = 'autoTtsEnabled';

export default function ChatContainer() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isFirstMessage, setIsFirstMessage] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatHistoryItem[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [chatTitle, setChatTitle] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isFirstMessageRef = useRef(true);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const [showChat, setShowChat] = useState(false);
  const [loadingTitle, setLoadingTitle] = useState(false);
  const [showHeader, setShowHeader] = useState(false);
  const [autoTtsEnabled, setAutoTtsEnabled] = useState(true); // 默认值设为true
  const [accessibilityMode, setAccessibilityMode] = useState(false); // 无障碍模式状态

  // 在客户端加载后，从localStorage读取朗读设置
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(AUTO_TTS_STORAGE_KEY);
        if (saved !== null) {
          setAutoTtsEnabled(JSON.parse(saved));
        }
      } catch (error) {
        console.error('读取朗读设置失败:', error);
      }
    }
  }, []);

  // 从localStorage加载历史记录
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const savedHistory = localStorage.getItem('chatHistory');
    if (savedHistory) {
      try {
        const parsedHistory = JSON.parse(savedHistory);
        // 转换Date字符串为Date对象
        const formattedHistory = parsedHistory.map((chat: any) => ({
          ...chat,
          createdAt: new Date(chat.createdAt),
          messages: chat.messages.map((msg: any) => ({
            ...msg,
            timestamp: new Date(msg.timestamp),
            mediaFile: undefined // 媒体文件无法序列化，需要重新上传
          }))
        }));
        setChatHistory(formattedHistory);
      } catch (error) {
        console.error('解析聊天历史记录失败:', error);
        localStorage.removeItem('chatHistory');
      }
    }
  }, []);

  // 监听autoTtsEnabled变化，保存到localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(AUTO_TTS_STORAGE_KEY, JSON.stringify(autoTtsEnabled));
    }
  }, [autoTtsEnabled]);

  // 保存历史记录到localStorage
  useEffect(() => {
    if (typeof window === 'undefined' || !currentChatId || messages.length === 0) return;
    
    // 检查是否已存在相同ID的聊天
    const existingChatIndex = chatHistory.findIndex(chat => chat.id === currentChatId);
    
    if (existingChatIndex !== -1) {
      // 更新已存在的聊天
      const updatedHistory = [...chatHistory];
      updatedHistory[existingChatIndex] = { 
        ...updatedHistory[existingChatIndex], 
        messages, 
        title: chatTitle || updatedHistory[existingChatIndex].title 
      };
      
      try {
        localStorage.setItem('chatHistory', JSON.stringify(updatedHistory));
        setChatHistory(updatedHistory);
      } catch (error) {
        console.error('保存聊天历史失败:', error);
      }
    }
  }, [messages, currentChatId, chatTitle]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 当聊天内容达到一定长度时，尝试生成标题
  useEffect(() => {
    if (
      messages.length >= 2 && 
      !chatTitle && 
      !isGenerating && 
      currentChatId && 
      messages.some(msg => msg.role === 'assistant')
    ) {
      generateChatTitle();
    }
  }, [messages, chatTitle, isGenerating, currentChatId]);

  const generateChatTitle = async () => {
    if (messages.length < 2 || isGenerating) return;
    
    setIsGenerating(true);
    
    try {
      // 提取用户的第一条消息
      const firstUserMessage = messages.find(msg => msg.role === 'user')?.content || '';
      
      // 创建标题生成提示
      const titlePrompt = `基于以下对话内容，生成一个简短的中文标题（不超过10个字）："${firstUserMessage}"`;
      
      // 创建请求体
      const requestBody = {
        messages: [
          { role: 'system', content: '你是一个专业的对话标题生成助手，请生成简短准确的中文标题。' },
          { role: 'user', content: titlePrompt }
        ]
      };
      
      // 直接调用API
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });
      
      if (!response.ok) {
        throw new Error('生成标题失败');
      }
      
      // 处理流式响应
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let generatedTitle = '';
      
      if (reader) {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n\n');
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(5).trim();
              
              if (data === '[DONE]') continue;
              
              try {
                const parsedData = JSON.parse(data);
                if (parsedData.content) {
                  generatedTitle += parsedData.content;
                  // 实时更新标题，但限制长度
                  setChatTitle(generatedTitle.substring(0, 15));
                }
              } catch (e) {
                console.error('解析标题数据失败:', e);
              }
            }
          }
        }
      }
      
      // 清理生成的标题（移除可能的引号）
      generatedTitle = generatedTitle.replace(/["""'']/g, '').trim();
      
      // 设置最终标题，确保不超过15个字符
      setChatTitle(generatedTitle.substring(0, 15));
    } catch (error) {
      console.error('生成标题失败:', error);
      // 设置默认标题
      setChatTitle(`对话 ${new Date().toLocaleString()}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSendMessage = async (content: string, mediaFile?: File) => {
    if (!content.trim() && !mediaFile) return;
    
    setIsLoading(true);
    
    // 如果是新对话，创建新的聊天记录
    if (!currentChatId) {
      const newChatId = Date.now().toString();
      setCurrentChatId(newChatId);
      
      const newChat: ChatHistoryItem = {
        id: newChatId,
        title: '新对话',
        messages: [],
        createdAt: new Date()
      };
      
      // 检查是否已存在相同ID的聊天，避免重复
      if (!chatHistory.some(chat => chat.id === newChatId)) {
        setChatHistory(prev => [newChat, ...prev]);
      }
    }
    
    // 创建用户消息
    const newMessage: Message = {
      id: Date.now().toString(),
      content,
      role: 'user',
      timestamp: new Date(),
      mediaFile: mediaFile || undefined
    };
    
    // 如果有媒体文件，添加媒体类型和URL
    if (mediaFile) {
      const mediaType = mediaFile.type.split('/')[0] as 'image' | 'audio' | 'video';
      newMessage.mediaType = mediaType;
      newMessage.mediaUrl = URL.createObjectURL(mediaFile);
    }
    
    setMessages((prev) => [...prev, newMessage]);
    
    // 处理第一条消息
    if (isFirstMessage) {
      setIsFirstMessage(false);
    }
    
    try {
      // 获取所有历史消息
      const allMessages = [
        { role: 'system', content: '你是一个有用的助手，能够理解和回答各种问题，包括分析媒体内容。请详细展示你的思考过程，然后给出结论。' },
        ...messages.map(msg => {
          // 移除媒体文件对象，避免序列化问题
          const { mediaFile, ...messageCopy } = msg;
          return {
            role: messageCopy.role,
            content: messageCopy.content
          };
        })
      ];
      
      // 如果有文本内容，添加到消息中
      if (content.trim()) {
        allMessages.push({
          role: 'user',
          content: content.trim()
        });
      } else if (mediaFile && !content.trim()) {
        // 如果只有媒体文件没有文本，添加默认文本
        allMessages.push({
          role: 'user',
          content: '请分析这个媒体内容'
        });
      }
      
      // 创建占位回复消息
      const placeholderId = (Date.now() + 1).toString();
      const placeholderMessage: Message = {
        id: placeholderId,
        content: '',
        role: 'assistant',
        timestamp: new Date(),
        isStreaming: true
      };
      
      setMessages(prev => [...prev, placeholderMessage]);
      
      let responseText = '';
      let reasoningContent = ''; // 存储思考过程
      
      try {
        const url = '/api/chat';
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messages: allMessages,
            media: mediaFile ? {
              type: mediaFile.type.split('/')[0],
              data: await fileToBase64(mediaFile),
              format: mediaFile.name.split('.').pop() || ''
            } : undefined
          }),
        });
        
        if (!response.ok) {
          throw new Error(`请求失败: ${response.statusText}`);
        }
        
        // 处理流式响应
        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('无法读取响应');
        }
        
        const decoder = new TextDecoder();
        let eventName = '';
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');
          
          for (const line of lines) {
            // 处理事件名称
            if (line.startsWith('event:')) {
              eventName = line.slice(6).trim();
              continue;
            }
            
            // 处理数据
            if (line.startsWith('data:')) {
              try {
                const jsonStr = line.slice(5).trim();
                
                // 处理结束标记
                if (jsonStr === '[END]') {
                  console.log('流式响应结束');
                  break;
                }
                
                // 处理普通消息
                if (jsonStr !== '[DONE]') {
                  const data = JSON.parse(jsonStr);
                  
                  // 处理内容
                  if (data.content) {
                    responseText += data.content;
                    
                    // 更新消息
                    setMessages(prev => 
                      prev.map(m => 
                        m.id === placeholderId 
                          ? { ...m, content: responseText } 
                          : m
                      )
                    );
                  }
                  
                  // 处理思考过程内容
                  if (data.reasoning_content) {
                    // 累积思考过程内容
                    reasoningContent = data.reasoning_content;
                    
                    // 更新消息的思考过程
                    setMessages(prev => 
                      prev.map(m => 
                        m.id === placeholderId 
                          ? { ...m, reasoning_content: reasoningContent } 
                          : m
                      )
                    );
                    
                    console.log('收到思考过程更新，长度:', reasoningContent.length);
                  }
                }
              } catch (e) {
                console.error('解析消息失败:', e, line);
              }
            }
          }
        }
        
        // 更新最终消息，移除流式标记
        setMessages(prev => 
          prev.map(m => 
            m.id === placeholderId 
              ? { 
                  ...m, 
                  isStreaming: false, 
                  content: responseText,
                  reasoning_content: reasoningContent || undefined 
                } 
              : m
          )
        );
        
        // 尝试生成标题（如果是第一条消息）
        if (isFirstMessage) {
          try {
            // 等待2秒，确保我们至少有一条完整的消息
            setTimeout(async () => {
              try {
                const titleResponse = await fetch('/api/chat/title', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    messages: [
                      ...allMessages,
                      { role: 'assistant', content: responseText }
                    ]
                  }),
                });
                
                if (titleResponse.ok) {
                  const { title } = await titleResponse.json();
                  if (title) {
                    setChatTitle(title);
                    
                    // 更新聊天历史
                    if (currentChatId) {
                      setChatHistory(prev => 
                        prev.map(chat => 
                          chat.id === currentChatId 
                            ? { ...chat, title } 
                            : chat
                        )
                      );
                    }
                  }
                }
              } catch (error) {
                console.error('获取标题失败:', error);
              }
            }, 2000);
          } catch (error) {
            console.error('获取标题失败:', error);
          }
        }
        
      } catch (error) {
        console.error('发送消息错误:', error);
        // 更新错误状态
        setMessages(prev => 
          prev.map(m => 
            m.id === placeholderId 
              ? { 
                  ...m, 
                  isStreaming: false, 
                  error: error instanceof Error ? error.message : '发送消息失败'
                } 
              : m
          )
        );
      }
    } catch (error) {
      console.error('消息处理错误:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleNewChat = () => {
    // 保存当前对话到历史记录
    if (currentChatId && messages.length > 0) {
      const updatedHistory = chatHistory.map(chat => 
        chat.id === currentChatId 
          ? { ...chat, messages, title: chatTitle || chat.title } 
          : chat
      );
      
      if (typeof window !== 'undefined') {
        localStorage.setItem('chatHistory', JSON.stringify(updatedHistory));
      }
      setChatHistory(updatedHistory);
    }
    
    // 重置当前对话
    setMessages([]);
    setCurrentChatId(null);
    setChatTitle('');
    setIsFirstMessage(true);
    setShowHistory(false);
  };

  const handleChatSelect = (chatId: string) => {
    // 保存当前对话
    if (currentChatId && messages.length > 0) {
      const updatedHistory = chatHistory.map(chat => 
        chat.id === currentChatId 
          ? { ...chat, messages, title: chatTitle || chat.title } 
          : chat
      );
      setChatHistory(updatedHistory);
      
      if (typeof window !== 'undefined') {
        localStorage.setItem('chatHistory', JSON.stringify(updatedHistory));
      }
    }
    
    // 加载选中的对话
    const selectedChat = chatHistory.find(chat => chat.id === chatId);
    if (selectedChat) {
      setMessages(selectedChat.messages);
      setCurrentChatId(chatId);
      setChatTitle(selectedChat.title);
      setIsFirstMessage(false);
    }
    
    setShowHistory(false);
  };

  const handleDeleteMessage = (id: string) => {
    // 获取要删除的消息
    const messageToDelete = messages.find(msg => msg.id === id);
    
    // 如果消息有mediaUrl，需要清理
    if (messageToDelete?.mediaUrl && !messageToDelete.mediaUrl.startsWith('data:')) {
      URL.revokeObjectURL(messageToDelete.mediaUrl);
    }
    
    // 删除消息
    setMessages(prev => prev.filter(msg => msg.id !== id));
  };

  const deleteChat = (chatId: string) => {
    // 找到要删除的聊天
    const chatToDelete = chatHistory.find(chat => chat.id === chatId);
    if (!chatToDelete) return;
    
    // 删除聊天中的相关媒体文件
    chatToDelete.messages.forEach(message => {
      if (message.mediaFile) {
        // 释放已创建的URL
        URL.revokeObjectURL(URL.createObjectURL(message.mediaFile));
      }
    });
    
    // 从历史记录中移除
    const updatedHistory = chatHistory.filter(chat => chat.id !== chatId);
    setChatHistory(updatedHistory);
    
    // 如果删除的是当前聊天，清空消息并重置状态
    if (chatId === currentChatId) {
      setMessages([]);
      setCurrentChatId(null);
      setIsFirstMessage(true);
      setChatTitle('');
    }
    
    // 保存更新后的历史记录到本地存储
    if (typeof window !== 'undefined') {
      localStorage.setItem('chatHistory', JSON.stringify(updatedHistory));
    }
  };

  // 首次加载时，设置过渡效果
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowChat(true);
    }, 500);
    
    return () => clearTimeout(timer);
  }, []);

  // 显示标题
  useEffect(() => {
    if (messages.length > 0) {
      setShowHeader(true);
    }
  }, [messages]);

  // 自动朗读最新的助手消息
  useEffect(() => {
    // 只有启用了自动朗读且有消息时才执行
    if (autoTtsEnabled && messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      
      // 只朗读助手的消息，且不是流式传输中的消息
      if (lastMessage.role === 'assistant' && !lastMessage.isStreaming) {
        // 停止之前的朗读
        stop();
        
        // 延迟一下再朗读，避免太快
        setTimeout(() => {
          speak(lastMessage.content, {
            lang: 'zh-CN',
            rate: 1.0,
            onError: (err: SpeechSynthesisErrorEvent) => console.error('语音合成错误:', err)
          });
        }, 300);
      }
    }
  }, [messages, autoTtsEnabled]);

  // 切换自动朗读功能
  const toggleAutoTts = () => {
    // 切换状态时，停止当前朗读
    stop();
    setAutoTtsEnabled((prev: boolean) => !prev);
  };

  // 切换无障碍模式
  const toggleAccessibilityMode = () => {
    // 关闭自动朗读功能以避免冲突
    if (!accessibilityMode) {
      stop();
    }
    setAccessibilityMode(!accessibilityMode);
  };

  // 监听键盘事件以启动无障碍模式
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Alt + A 组合键开启无障碍模式
      if (e.altKey && e.key === 'a') {
        e.preventDefault();
        toggleAccessibilityMode();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [accessibilityMode]);

  // 清理URL.createObjectURL创建的对象URLs
  useEffect(() => {
    return () => {
      // 在组件卸载时清理所有消息中的媒体URL
      messages.forEach(message => {
        if (message.mediaUrl && !message.mediaUrl.startsWith('data:')) {
          URL.revokeObjectURL(message.mediaUrl);
        }
      });
    };
  }, []);
  
  // 当消息更新时，检查并清理不再需要的URL
  useEffect(() => {
    const messageIds = new Set(messages.map(msg => msg.id));
    
    // 找出已被删除的消息
    const prevMessages = messagesRef.current || [];
    const deletedMessages = prevMessages.filter(msg => !messageIds.has(msg.id));
    
    // 清理已删除消息的mediaUrl
    deletedMessages.forEach(message => {
      if (message.mediaUrl && !message.mediaUrl.startsWith('data:')) {
        URL.revokeObjectURL(message.mediaUrl);
      }
    });
    
    // 更新引用
    messagesRef.current = messages;
  }, [messages]);
  
  // 消息引用，用于追踪已删除的消息
  const messagesRef = useRef(messages);

  return (
    <div className="flex w-full h-screen">
      {/* 侧边栏 */}
      <div className="w-64 flex-shrink-0 bg-gray-50 border-r border-gray-200 p-4 overflow-y-auto">
        <button
          className="w-full flex items-center justify-center p-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors mb-4"
          onClick={handleNewChat}
        >
          <PlusCircleIcon className="w-5 h-5 mr-2" />
          新会话
        </button>

        <h2 className="text-lg font-medium mb-2">历史记录</h2>
        {chatHistory.length === 0 ? (
          <p className="text-gray-500 text-center py-4">暂无历史记录</p>
        ) : (
          <ul className="space-y-2">
            {chatHistory.map((chat) => (
              <li
                key={chat.id}
                className={`p-2 rounded-md cursor-pointer hover:bg-gray-200 transition-colors ${
                  chat.id === currentChatId ? "bg-gray-200" : ""
                } relative group`}
              >
                <div
                  className="truncate font-medium"
                  onClick={() => handleChatSelect(chat.id)}
                >
                  {chat.title || "新对话"}
                </div>
                <div 
                  className="text-xs text-gray-500"
                  onClick={() => handleChatSelect(chat.id)}
                >
                  {new Date(chat.createdAt).toLocaleString()}
                </div>
                
                {/* 删除按钮，鼠标悬停时显示 */}
                <button
                  className="absolute top-1 right-1 p-1 rounded-full text-red-500 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm('确定要删除此聊天记录吗？')) {
                      deleteChat(chat.id);
                    }
                  }}
                  title="删除聊天记录"
                  aria-label="删除聊天记录"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 主聊天区域 */}
      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
        <div className="flex-1 overflow-y-auto p-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full">
              <Greeting />
              <div className="w-full max-w-xl mx-auto mt-8">
                <ChatInput onSendMessage={handleSendMessage} position="center" />
              </div>
            </div>
          ) : (
            <div className="space-y-4 pb-4">
              {messages.map((message) => (
                <ChatMessage 
                  key={message.id} 
                  message={message} 
                  onDelete={() => handleDeleteMessage(message.id)}
                />
              ))}
              {isGenerating && <Typography text={chatTitle || '正在生成标题...'} />}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
        
        {/* 自动朗读控制按钮 */}
        <div className="fixed bottom-20 right-4 z-30 flex flex-col gap-2">
          <button
            onClick={toggleAccessibilityMode}
            className={`p-2 rounded-full shadow-lg transition-all duration-200 ${
              accessibilityMode ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-600'
            }`}
            title={accessibilityMode ? "关闭无障碍导航" : "开启无障碍导航 (Alt+A)"}
            aria-label={accessibilityMode ? "关闭无障碍导航" : "开启无障碍导航"}
            aria-pressed={accessibilityMode}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 002 2h3a2 2 0 002-2V7a2 2 0 00-2-2H5zm0 8a2 2 0 00-2 2v3a2 2 0 002 2h3a2 2 0 002-2v-3a2 2 0 00-2-2H5zm8-8a2 2 0 00-2 2v3a2 2 0 002 2h3a2 2 0 002-2V7a2 2 0 00-2-2h-3zm0 8a2 2 0 00-2 2v3a2 2 0 002 2h3a2 2 0 002-2v-3a2 2 0 00-2-2h-3z" />
            </svg>
          </button>
          
          <button
            onClick={toggleAutoTts}
            className={`p-2 rounded-full shadow-lg transition-all duration-200 ${
              autoTtsEnabled ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-600'
            }`}
            title={autoTtsEnabled ? "关闭自动朗读" : "开启自动朗读"}
            aria-label={autoTtsEnabled ? "关闭自动朗读" : "开启自动朗读"}
            aria-pressed={autoTtsEnabled}
          >
            {autoTtsEnabled ? (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
              </svg>
            )}
          </button>
        </div>

        {/* 当有消息时才显示底部输入框 */}
        {messages.length > 0 && (
          <div className="w-full border-t border-gray-200 bg-white transition-all duration-500 ease-in-out transform">
            <div className="max-w-4xl mx-auto">
              <ChatInput onSendMessage={handleSendMessage} position="bottom" />
            </div>
          </div>
        )}
      </div>
      
      {/* 无障碍导航组件 */}
      <AccessibilityNavigation 
        isActive={accessibilityMode} 
        onToggle={toggleAccessibilityMode} 
      />
    </div>
  );
} 