'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { speak, stop, pause, resume, isReading } from '@/utils/textToSpeech';

// 焦点元素类型
interface FocusableElement {
  element: HTMLElement;
  rect: DOMRect;
  description: string;
  actionDescription: string;
}

// 组件属性
interface AccessibilityNavigationProps {
  isActive: boolean;
  onToggle: () => void;
}

// 元素类型映射表
const elementTypeMap: Record<string, string> = {
  'button': '按钮',
  'input': '输入框',
  'textarea': '文本输入区域',
  'a': '链接',
  'select': '下拉选择框',
  'article': '消息',
};

// 获取元素的可读描述
const getElementDescription = (element: HTMLElement): string => {
  // 检查元素是否具有特定属性
  const messageType = element.getAttribute('data-sender');
  if (messageType) {
    return `${messageType === 'assistant' ? '助手' : '用户'}的消息: ${element.textContent?.slice(0, 100) || ''}`;
  }

  // 获取元素的文本内容
  const text = element.innerText || element.textContent || '';
  const trimmedText = text.trim().slice(0, 100);
  
  // 尝试获取无障碍标签
  const ariaLabel = element.getAttribute('aria-label');
  const title = element.getAttribute('title');
  
  // 确定元素类型
  const tagName = element.tagName.toLowerCase();
  const elementType = elementTypeMap[tagName] || '元素';
  
  // 按优先级返回元素描述
  if (ariaLabel) return ariaLabel;
  if (title) return title;
  if (trimmedText) return `${elementType}: ${trimmedText}`;
  return `未命名${elementType}`;
};

// 获取元素的操作描述
const getActionDescription = (element: HTMLElement): string => {
  const tagName = element.tagName.toLowerCase();
  
  if (tagName === 'button') return '按回车键激活此按钮';
  if (tagName === 'input' || tagName === 'textarea') return '按回车键开始编辑';
  if (tagName === 'a') return '按回车键打开链接';
  if (tagName === 'select') return '按回车键展开选项';
  if (element.getAttribute('data-sender')) return '按回车键朗读此消息';
  
  return '按回车键选择';
};

// 判断元素是否可见
const isElementVisible = (element: HTMLElement): boolean => {
  const rect = element.getBoundingClientRect();
  
  // 检查元素是否有大小且在视口内
  if (rect.width === 0 || rect.height === 0) return false;
  if (rect.bottom < 0 || rect.top > window.innerHeight) return false;
  if (rect.right < 0 || rect.left > window.innerWidth) return false;
  
  // 检查元素的可见性
  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
  
  return true;
};

const AccessibilityNavigation: React.FC<AccessibilityNavigationProps> = ({ isActive, onToggle }) => {
  // 状态管理
  const [focusIndex, setFocusIndex] = useState<number>(-1);
  const [focusableElements, setFocusableElements] = useState<FocusableElement[]>([]);
  const [showInfo, setShowInfo] = useState<boolean>(true);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  
  // 视觉指示器的引用
  const indicatorRef = useRef<HTMLDivElement>(null);
  
  // 收集所有可聚焦元素
  const collectFocusableElements = useCallback(() => {
    if (!isActive) return;
    
    // 选择器列表，按优先级排序
    const selectors = [
      // 消息元素
      '[data-message]',
      // 输入框和按钮
      'button:not([disabled])',
      'input:not([disabled])',
      'textarea:not([disabled])',
      'a[href]',
      'select:not([disabled])',
    ];
    
    // 合并查询
    const allElements = document.querySelectorAll<HTMLElement>(selectors.join(', '));
    
    // 过滤可见元素并提取信息
    const visibleElements = Array.from(allElements)
      .filter(isElementVisible)
      .map(element => ({
        element,
        rect: element.getBoundingClientRect(),
        description: getElementDescription(element),
        actionDescription: getActionDescription(element),
      }));
    
    // 按照从上到下、从左到右的顺序排序
    visibleElements.sort((a, b) => {
      // 如果元素纵向位置相差超过元素高度，则以纵向位置为主
      if (Math.abs(a.rect.top - b.rect.top) > Math.min(a.rect.height, b.rect.height)) {
        return a.rect.top - b.rect.top;
      }
      // 否则按照水平位置排序
      return a.rect.left - b.rect.left;
    });
    
    setFocusableElements(visibleElements);
    
    // 如果还没有选中元素且有可选元素，则选中第一个
    if (focusIndex === -1 && visibleElements.length > 0) {
      setFocusIndex(0);
    }
  }, [isActive, focusIndex]);
  
  // 当组件激活时收集可聚焦元素
  useEffect(() => {
    if (isActive) {
      collectFocusableElements();
      
      // 添加窗口大小变化监听器，在布局变化时重新收集元素
      window.addEventListener('resize', collectFocusableElements);
      
      // 设置一个定时器定期更新元素列表，以捕获DOM变化
      const intervalId = setInterval(collectFocusableElements, 2000);
      
      return () => {
        window.removeEventListener('resize', collectFocusableElements);
        clearInterval(intervalId);
      };
    } else {
      // 重置状态
      setFocusIndex(-1);
      setFocusableElements([]);
      stop(); // 停止所有语音播报
    }
  }, [isActive, collectFocusableElements]);
  
  // 更新视觉指示器位置和朗读描述
  useEffect(() => {
    if (!isActive || focusIndex === -1 || !focusableElements.length) return;
    
    const currentElement = focusableElements[focusIndex];
    
    // 更新视觉指示器位置
    if (indicatorRef.current && currentElement) {
      const rect = currentElement.rect;
      indicatorRef.current.style.top = `${rect.top - 5}px`;
      indicatorRef.current.style.left = `${rect.left - 5}px`;
      indicatorRef.current.style.width = `${rect.width + 10}px`;
      indicatorRef.current.style.height = `${rect.height + 10}px`;
    }
    
    // 朗读当前元素描述
    if (isPlaying && currentElement) {
      stop(); // 停止之前的朗读
      speak(currentElement.description);
    }
  }, [focusIndex, focusableElements, isActive, isPlaying]);
  
  // 切换播放状态
  const togglePlay = () => {
    if (isReading()) {
      if (isPlaying) {
        pause();
      } else {
        resume();
      }
    } else if (isPlaying && focusIndex >= 0 && focusableElements[focusIndex]) {
      speak(focusableElements[focusIndex].description);
    }
    setIsPlaying(!isPlaying);
  };
  
  // 根据方向移动焦点
  const moveFocus = (direction: 'up' | 'down' | 'left' | 'right') => {
    if (focusableElements.length === 0) return;
    
    const current = focusIndex >= 0 ? focusableElements[focusIndex] : null;
    if (!current) {
      setFocusIndex(0);
      return;
    }
    
    // 获取当前位置
    const currentRect = current.rect;
    let bestMatch: FocusableElement | null = null;
    let bestDistance = Infinity;
    
    // 寻找最佳匹配元素
    focusableElements.forEach((element, index) => {
      if (index === focusIndex) return; // 跳过当前元素
      
      const rect = element.rect;
      let isInDirection = false;
      let distance = 0;
      
      switch (direction) {
        case 'up':
          isInDirection = rect.bottom < currentRect.top;
          if (isInDirection) {
            // 垂直距离 + 水平偏差的惩罚
            distance = currentRect.top - rect.bottom + 
                      Math.abs(rect.left - currentRect.left) * 0.5;
          }
          break;
        case 'down':
          isInDirection = rect.top > currentRect.bottom;
          if (isInDirection) {
            distance = rect.top - currentRect.bottom + 
                      Math.abs(rect.left - currentRect.left) * 0.5;
          }
          break;
        case 'left':
          isInDirection = rect.right < currentRect.left;
          if (isInDirection) {
            distance = currentRect.left - rect.right + 
                      Math.abs(rect.top - currentRect.top) * 0.5;
          }
          break;
        case 'right':
          isInDirection = rect.left > currentRect.right;
          if (isInDirection) {
            distance = rect.left - currentRect.right + 
                      Math.abs(rect.top - currentRect.top) * 0.5;
          }
          break;
      }
      
      // 如果找到了符合方向的元素且距离更近，更新最佳匹配
      if (isInDirection && distance < bestDistance) {
        bestMatch = element;
        bestDistance = distance;
      }
    });
    
    // 如果找到了最佳匹配，更新焦点
    if (bestMatch) {
      const newIndex = focusableElements.indexOf(bestMatch);
      setFocusIndex(newIndex);
    } else {
      // 如果没有最佳匹配，尝试循环到边界
      if (direction === 'down' || direction === 'right') {
        setFocusIndex(0); // 回到第一个元素
      } else if (direction === 'up' || direction === 'left') {
        setFocusIndex(focusableElements.length - 1); // 跳到最后一个元素
      }
    }
  };
  
  // 激活当前选中的元素
  const activateCurrentElement = () => {
    if (focusIndex >= 0 && focusableElements[focusIndex]) {
      const current = focusableElements[focusIndex];
      current.element.click();
      
      // 如果是输入元素，则聚焦
      if (current.element.tagName.toLowerCase() === 'input' || 
          current.element.tagName.toLowerCase() === 'textarea') {
        current.element.focus();
      }
    }
  };
  
  // 键盘事件处理
  useEffect(() => {
    if (!isActive) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      // 防止事件冒泡和默认行为
      e.preventDefault();
      e.stopPropagation();
      
      switch (e.key) {
        case 'ArrowUp':
          moveFocus('up');
          break;
        case 'ArrowDown':
          moveFocus('down');
          break;
        case 'ArrowLeft':
          moveFocus('left');
          break;
        case 'ArrowRight':
          moveFocus('right');
          break;
        case 'Enter':
          activateCurrentElement();
          break;
        case ' ': // 空格键
          togglePlay();
          break;
        case 'Escape':
          onToggle(); // 退出无障碍模式
          break;
        case 'i':
          setShowInfo(!showInfo); // 切换信息面板显示
          break;
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isActive, focusIndex, focusableElements, isPlaying, showInfo, onToggle]);
  
  // 如果模式未激活，不渲染任何内容
  if (!isActive) return null;
  
  return (
    <>
      {/* 视觉指示器 */}
      <div
        ref={indicatorRef}
        className="fixed z-50 pointer-events-none border-2 border-blue-500 rounded-md transition-all duration-200 ease-in-out"
        style={{
          boxShadow: '0 0 0 2px rgba(59, 130, 246, 0.5)',
        }}
      />
      
      {/* 信息面板 */}
      {showInfo && (
        <div className="fixed right-4 top-4 z-50 bg-white shadow-lg rounded-lg p-4 w-80 border border-gray-200">
          <h3 className="text-lg font-bold mb-2">无障碍导航模式</h3>
          <div className="space-y-2 text-sm">
            <p><span className="font-bold">方向键：</span>在元素间移动焦点</p>
            <p><span className="font-bold">回车键：</span>激活当前元素</p>
            <p><span className="font-bold">空格键：</span>{isPlaying ? '暂停' : '继续'}语音播报</p>
            <p><span className="font-bold">I 键：</span>隐藏此帮助面板</p>
            <p><span className="font-bold">ESC 键：</span>退出无障碍导航</p>
          </div>
          <div className="mt-4 text-sm">
            {focusIndex >= 0 && focusableElements[focusIndex] ? (
              <div className="p-2 bg-gray-100 rounded">
                <p className="font-bold">当前选中：</p>
                <p>{focusableElements[focusIndex].description}</p>
                <p className="text-blue-600 mt-1">{focusableElements[focusIndex].actionDescription}</p>
              </div>
            ) : (
              <p className="italic text-gray-500">未选中任何元素</p>
            )}
          </div>
          <div className="mt-2 flex justify-between">
            <button
              onClick={togglePlay}
              className={`px-2 py-1 rounded text-sm ${isPlaying ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}
            >
              {isPlaying ? '暂停语音' : '继续语音'}
            </button>
            <button
              onClick={onToggle}
              className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-sm"
            >
              退出模式
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default AccessibilityNavigation; 