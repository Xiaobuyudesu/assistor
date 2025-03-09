'use client';

import { useState, useEffect } from 'react';

export default function Greeting() {
  const [greeting, setGreeting] = useState('');
  const [displayedGreeting, setDisplayedGreeting] = useState('');
  const [typingComplete, setTypingComplete] = useState(false);
  const [showCursor, setShowCursor] = useState(true);

  useEffect(() => {
    const hour = new Date().getHours();
    let timeGreeting = '';
    
    if (hour >= 5 && hour < 12) {
      timeGreeting = '早上好';
    } else if (hour >= 12 && hour < 18) {
      timeGreeting = '下午好';
    } else {
      timeGreeting = '晚上好';
    }
    
    setGreeting(`${timeGreeting}，我是您的AI助手`);
  }, []);

  useEffect(() => {
    if (!greeting) return;
    
    let index = 0;
    const typingInterval = setInterval(() => {
      if (index <= greeting.length) {
        setDisplayedGreeting(greeting.substring(0, index));
        index++;
      } else {
        clearInterval(typingInterval);
        setTypingComplete(true);
      }
    }, 80); // 稍微加快速度
    
    // 添加光标闪烁效果
    const cursorInterval = setInterval(() => {
      setShowCursor(prev => !prev);
    }, 530);
    
    return () => {
      clearInterval(typingInterval);
      clearInterval(cursorInterval);
    };
  }, [greeting]);

  // 生成随机灵感提示
  const getRandomSuggestion = () => {
    const suggestions = [
      "想要分析一张照片？发送给我试试看",
      "有语音问题？我可以听你说话",
      "拍摄视频遇到问题？我能帮你分析",
      "有灵感闪现？告诉我你的想法",
      "工作中遇到瓶颈？我可以协助你",
      "需要创意建议？我随时准备",
      "想要学习新知识？问我任何问题"
    ];
    return suggestions[Math.floor(Math.random() * suggestions.length)];
  };

  return (
    <div className="text-center mb-8 max-w-2xl mx-auto">
      <div className="bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-transparent bg-clip-text mb-4">
        <h1 className="text-xl md:text-2xl font-medium mb-1">
          {displayedGreeting}
          <span className={`ml-1 ${showCursor ? 'opacity-100' : 'opacity-0'} transition-opacity duration-100`}>|</span>
        </h1>
      </div>
      
      {typingComplete && (
        <div className="animate-fade-in">
          <p className="text-gray-700 text-xs md:text-sm mb-6">
            我能看照片、看视频、听语音，解决各种难题，请尽管提问
          </p>
          
          <div className="bg-gray-50 p-3 rounded-xl shadow-sm border border-gray-200 mb-4">
            <p className="text-gray-600 text-xs font-medium mb-1">✨ 灵感提示</p>
            <p className="text-gray-800 text-xs">{getRandomSuggestion()}</p>
          </div>
          
          <div className="flex justify-center space-x-6 mt-5">
            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-500">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center text-red-500">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center text-green-500">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 