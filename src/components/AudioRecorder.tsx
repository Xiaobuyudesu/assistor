'use client';

import { useState, useRef, useEffect } from 'react';

interface AudioRecorderProps {
  onAudioCaptured: (audioBlob: Blob) => void;
  onCancel: () => void;
  isOpen: boolean;
  onToggle: () => void;
}

export default function AudioRecorder({ onAudioCaptured, onCancel, isOpen, onToggle }: AudioRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // 当组件打开时，立即请求麦克风权限并开始录制
  useEffect(() => {
    if (isOpen && !streamRef.current) {
      setupAudioStream().then(() => {
        if (streamRef.current) startRecordingWithStream();
      });
    }
    
    // 组件卸载时清理资源
    return () => {
      cleanupResources();
    };
  }, [isOpen]);

  const cleanupResources = () => {
    // 停止所有轨道
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    // 停止计时
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  // 设置音频流
  const setupAudioStream = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      return true;
    } catch (error) {
      console.error('无法访问麦克风:', error);
      alert('无法访问麦克风，请确保您已授予权限。');
      onCancel();
      return false;
    }
  };

  // 使用已存在的流开始录制
  const startRecordingWithStream = () => {
    if (!streamRef.current) return;
    
    const mediaRecorder = new MediaRecorder(streamRef.current);
    mediaRecorderRef.current = mediaRecorder;
    audioChunksRef.current = [];
    
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunksRef.current.push(event.data);
      }
    };
    
    mediaRecorder.onstop = () => {
      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/mp3' });
      // 录制完成后直接发送给父组件
      onAudioCaptured(audioBlob);
      // 关闭录音弹窗
      onToggle();
    };
    
    mediaRecorder.start();
    setIsRecording(true);
    
    // 开始计时
    setRecordingTime(0);
    timerRef.current = setInterval(() => {
      setRecordingTime(prev => prev + 1);
    }, 1000);
  };

  // 停止录制
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      
      // 停止计时
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  // 取消录制
  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
    }
    
    cleanupResources();
    setIsRecording(false);
    setRecordingTime(0);
    onCancel();
  };

  // 处理录制按钮点击
  const handleRecordButtonClick = () => {
    if (isRecording) {
      stopRecording();
    } else {
      if (streamRef.current) {
        startRecordingWithStream();
      } else {
        setupAudioStream().then(success => {
          if (success) startRecordingWithStream();
        });
      }
    }
  };

  // 格式化时间显示为 MM:SS
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
    const secs = (seconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-lg shadow-lg w-full max-w-md">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-medium">录制语音</h3>
          <button 
            onClick={cancelRecording}
            className="text-gray-500 hover:text-gray-700"
            title="关闭"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="flex justify-center mb-4">
          <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center cursor-pointer"
               onClick={handleRecordButtonClick}>
            <div 
              className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${isRecording ? 'bg-red-500 scale-90' : 'bg-blue-500 hover:bg-blue-600'}`}
            >
              {isRecording ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <rect x="6" y="6" width="12" height="12" fill="white" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              )}
            </div>
          </div>
        </div>
        
        <div className="text-center mb-6">
          {isRecording ? (
            <p className="text-lg font-medium">{formatTime(recordingTime)} <span className="text-sm text-gray-500">(再次点击停止录制)</span></p>
          ) : (
            <p className="text-gray-500">点击上方按钮开始录音</p>
          )}
        </div>
      </div>
    </div>
  );
} 