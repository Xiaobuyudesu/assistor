'use client';

import { useState, useEffect } from 'react';

interface TypographyProps {
  text: string;
  speed?: number;
}

export default function Typography({ text, speed = 50 }: TypographyProps) {
  const [displayedText, setDisplayedText] = useState('');
  const [index, setIndex] = useState(0);
  
  useEffect(() => {
    // 重置当文本改变时
    setDisplayedText('');
    setIndex(0);
  }, [text]);
  
  useEffect(() => {
    if (index < text.length) {
      const timer = setTimeout(() => {
        setDisplayedText(prev => prev + text[index]);
        setIndex(index + 1);
      }, speed);
      
      return () => clearTimeout(timer);
    }
  }, [index, text, speed]);
  
  return <span>{displayedText || text}</span>;
}