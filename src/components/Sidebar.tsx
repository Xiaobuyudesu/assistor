'use client';

import { useState } from 'react';

interface ChatHistory {
  id: string;
  title: string;
  timestamp: Date;
}

export default function Sidebar({ onNewChat }: { onNewChat: () => void }) {
  const [chatHistory, setChatHistory] = useState<ChatHistory[]>([]);

  return (
    <div className="h-screen bg-gray-100 w-64 p-4 flex flex-col border-r border-gray-200">
      <button
        onClick={onNewChat}
        className="mb-4 w-full bg-blue-500 hover:bg-blue-600 text-white py-2 px-4 rounded-md flex items-center justify-center"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
        </svg>
        新对话
      </button>
      
      <div className="flex-1 overflow-y-auto">
        <h2 className="text-sm font-semibold text-gray-500 mb-2">历史记录</h2>
        <ul>
          {chatHistory.map((chat) => (
            <li key={chat.id} className="mb-1">
              <button className="w-full text-left p-2 rounded-md hover:bg-gray-200 text-sm">
                {chat.title}
                <div className="text-xs text-gray-500">
                  {chat.timestamp.toLocaleDateString()}
                </div>
              </button>
            </li>
          ))}
          {chatHistory.length === 0 && (
            <li className="text-sm text-gray-400 italic p-2">
              暂无历史记录
            </li>
          )}
        </ul>
      </div>
    </div>
  );
} 