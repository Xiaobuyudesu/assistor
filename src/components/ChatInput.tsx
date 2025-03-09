'use client';

import React, { useState, useRef, useEffect } from 'react';
import AudioRecorder from './AudioRecorder';
import VideoRecorder from './VideoRecorder';
import PhotoCapture from './PhotoCapture';
import { validateFileSize, validateVideoDuration, testBase64Conversion } from '@/utils/api';
import { compressVideo, convertAudioFormat } from '@/utils/mediaUtils';

interface ChatInputProps {
  onSendMessage: (message: string, mediaFile?: File) => void;
  position: 'center' | 'bottom';
}

export default function ChatInput({ onSendMessage, position }: ChatInputProps) {
  const [message, setMessage] = useState('');
  const [showAudioRecorder, setShowAudioRecorder] = useState(false);
  const [showVideoRecorder, setShowVideoRecorder] = useState(false);
  const [showPhotoCapture, setShowPhotoCapture] = useState(false);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'image' | 'video' | 'audio' | null>(null);
  const [isLoadingMedia, setIsLoadingMedia] = useState(false);
  const [mediaProcessingMessage, setMediaProcessingMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // 清理预览URL
  useEffect(() => {
    return () => {
      if (mediaPreview && mediaPreview !== 'audio') {
        URL.revokeObjectURL(mediaPreview);
      }
    };
  }, [mediaPreview]);
  
  const handleSendMessage = () => {
    if (message.trim() || mediaFile) {
      onSendMessage(message, mediaFile || undefined);
      setMessage('');
      setMediaFile(null);
      if (mediaPreview && mediaPreview !== 'audio') {
        URL.revokeObjectURL(mediaPreview);
      }
      setMediaPreview(null);
      setMediaType(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };
  
  const handleAudioCaptured = (audioBlob: Blob) => {
    const file = new File([audioBlob], `audio_${Date.now()}.mp3`, { type: 'audio/mp3' });
    
    // 测试base64转换性能
    try {
      testBase64Conversion(file);
    } catch (error) {
      console.error('Base64转换测试失败:', error);
      // 继续处理，不阻止用户操作
    }
    
    setMediaFile(file);
    setMediaPreview('audio');
    setMediaType('audio');
    setShowAudioRecorder(false);
  };
  
  const handleVideoCaptured = (videoBlob: Blob) => {
    const file = new File([videoBlob], `video_${Date.now()}.mp4`, { type: 'video/mp4' });
    
    // 验证文件大小
    if (!validateFileSize(file)) {
      alert('视频文件大小不能超过19MB');
      setShowVideoRecorder(false);
      return;
    }
    
    // 测试base64转换性能
    try {
      testBase64Conversion(file);
    } catch (error) {
      console.error('Base64转换测试失败:', error);
      // 继续处理，不阻止用户操作
    }
    
    setMediaFile(file);
    
    // 创建视频预览
    if (mediaPreview && mediaPreview !== 'audio') {
      URL.revokeObjectURL(mediaPreview);
    }
    const videoUrl = URL.createObjectURL(videoBlob);
    setMediaPreview(videoUrl);
    setMediaType('video');
    setShowVideoRecorder(false);
  };
  
  const handlePhotoCaptured = (imageBlob: Blob) => {
    const file = new File([imageBlob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' });
    
    // 验证文件大小
    if (!validateFileSize(file)) {
      alert('图片文件大小不能超过19MB');
      setShowPhotoCapture(false);
      return;
    }
    
    // 测试base64转换性能
    try {
      testBase64Conversion(file);
    } catch (error) {
      console.error('Base64转换测试失败:', error);
      // 继续处理，不阻止用户操作
    }
    
    setMediaFile(file);
    
    // 创建图片预览
    if (mediaPreview && mediaPreview !== 'audio') {
      URL.revokeObjectURL(mediaPreview);
    }
    const imageUrl = URL.createObjectURL(imageBlob);
    setMediaPreview(imageUrl);
    setMediaType('image');
    setShowPhotoCapture(false);
  };
  
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 设置加载状态
    setIsLoadingMedia(true);
    setMediaProcessingMessage('正在处理媒体文件...');
    
    // 最大文件大小限制 - 19MB (对应20MB限制的安全值)
    const MAX_FILE_SIZE = 19 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      setIsLoadingMedia(false);
      setMediaProcessingMessage('');
      alert('文件太大，请选择小于19MB的文件');
      return;
    }

    try {
      let processedFile = file;
      const fileType = file.type.split('/')[0];

      // 处理视频文件 - 检查大小和时长
      if (fileType === 'video') {
        // 验证视频时长
        const isValidDuration = await validateVideoDuration(file);
        if (!isValidDuration) {
          setIsLoadingMedia(false);
          setMediaProcessingMessage('');
          alert('视频时长不能超过1分钟，请选择更短的视频');
          return;
        }

        // 确定视频是否需要压缩或格式转换
        const VIDEO_COMPRESSION_THRESHOLD = 18 * 1024 * 1024; // 18MB
        const videoFormat = file.name.split('.').pop()?.toLowerCase();
        
        if (file.size > VIDEO_COMPRESSION_THRESHOLD) {
          // 需要压缩
          setMediaProcessingMessage('文件较大，正在压缩视频...');
          const compressedBlob = await compressVideo(file, {
            maxWidth: 640,
            maxHeight: 480,
            targetFormat: 'mp4',
            frameRate: 24,
            quality: 0.8,
          });
          
          // 将Blob转换为File对象
          processedFile = new File(
            [compressedBlob], 
            file.name.replace(/\.[^/.]+$/, ".mp4"), 
            { type: 'video/mp4', lastModified: Date.now() }
          );
          setMediaProcessingMessage('视频压缩完成！');
        } else if (videoFormat !== 'mp4') {
          // 仅需要格式转换 - 通义千问API支持MP4格式
          setMediaProcessingMessage('正在转换视频格式...');
          const convertedBlob = await compressVideo(file, {
            // 不指定宽高，使用默认值保持原始分辨率
            targetFormat: 'mp4',
            quality: 1.0,
          });
          
          // 将Blob转换为File对象
          processedFile = new File(
            [convertedBlob], 
            file.name.replace(/\.[^/.]+$/, ".mp4"), 
            { type: 'video/mp4', lastModified: Date.now() }
          );
          setMediaProcessingMessage('视频格式转换完成！');
        }
      } else if (fileType === 'audio') {
        // 确保音频为MP3格式 - 通义千问API更好地支持MP3
        const audioFormat = file.name.split('.').pop()?.toLowerCase();
        if (audioFormat !== 'mp3') {
          setMediaProcessingMessage('正在转换音频格式到MP3...');
          const convertedBlob = await convertAudioFormat(file, 'mp3');
          processedFile = new File(
            [convertedBlob],
            file.name.replace(/\.[^/.]+$/, ".mp3"),
            { type: 'audio/mp3', lastModified: Date.now() }
          );
          setMediaProcessingMessage('音频格式转换完成！');
        }
      }

      // 测试base64转换性能
      try {
        const testReader = new FileReader();
        testReader.readAsDataURL(processedFile);
        await new Promise((resolve) => {
          testReader.onload = resolve;
        });
      } catch (err) {
        console.error('Base64转换性能测试失败:', err);
      }

      // 更新文件和预览
      setMediaFile(processedFile);
      
      // 清除旧的预览URL
      if (mediaPreview && mediaPreview !== 'audio') {
        URL.revokeObjectURL(mediaPreview);
      }
      
      // 创建新的预览URL
      if (fileType === 'audio') {
        setMediaPreview('audio');
        setMediaType('audio');
      } else {
        const fileURL = URL.createObjectURL(processedFile);
        setMediaPreview(fileURL);
        setMediaType(fileType as 'image' | 'video');
      }
      
      // 重置input以允许重新选择相同文件
      e.target.value = '';
    } catch (error) {
      console.error('处理媒体文件时出错:', error);
      setMediaProcessingMessage('处理媒体文件失败，请重试');
    } finally {
      setIsLoadingMedia(false);
    }
  };
  
  const clearMedia = () => {
    setMediaFile(null);
    if (mediaPreview && mediaPreview !== 'audio') {
      URL.revokeObjectURL(mediaPreview);
    }
    setMediaPreview(null);
    setMediaType(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // 根据媒体类型获取预览标题
  const getMediaTypeTitle = () => {
    if (!mediaType) return '';
    const types = {
      'audio': '音频',
      'video': '视频',
      'image': '图片'
    };
    return types[mediaType];
  };

  return (
    <>
      <div className={`
        w-full max-w-4xl mx-auto p-4 transition-all duration-500 ease-in-out relative z-10
        ${position === 'center' ? 'mt-4 mb-8' : 'mt-auto'}
      `}>
        {/* 媒体预览区域 - 使用固定定位防止下移 */}
        {isLoadingMedia && (
          <div className="fixed bottom-[140px] left-1/2 transform -translate-x-1/2 z-40 bg-blue-50 p-3 rounded-lg shadow-lg border border-blue-200 min-w-[300px] max-w-sm">
            <div className="flex items-center">
              <div className="w-5 h-5 border-2 border-t-blue-500 border-blue-300 rounded-full animate-spin mr-3"></div>
              <span className="text-sm text-blue-700 font-medium">{mediaProcessingMessage || '处理媒体中...'}</span>
            </div>
          </div>
        )}
        
        {mediaPreview && (
          <div className="fixed bottom-[140px] left-1/2 transform -translate-x-1/2 w-full max-w-md z-30">
            <div className="relative bg-white p-4 rounded-lg shadow-lg border border-gray-200 mx-4">
              {/* 预览标题 */}
              <div className="text-sm font-medium text-gray-700 mb-3 flex items-center justify-between">
                <div className="flex items-center">
                  {mediaType === 'audio' && (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-500 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                    </svg>
                  )}
                  {mediaType === 'video' && (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-red-500 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  )}
                  {mediaType === 'image' && (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-500 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  )}
                  <span>已选择{getMediaTypeTitle()}</span>
                </div>
                
                <button 
                  className="bg-red-100 text-red-600 rounded-full p-1.5 hover:bg-red-200 transition-colors focus:outline-none focus:ring-2 focus:ring-red-400"
                  onClick={clearMedia}
                  title="删除媒体"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              <div className="bg-gray-50 rounded-lg p-2 border border-gray-100">
                {mediaPreview === 'audio' ? (
                  <div className="flex items-center p-3 bg-blue-50 rounded-md">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg>
                    <span className="ml-2 text-sm">音频文件已准备好发送</span>
                  </div>
                ) : mediaType === 'image' ? (
                  <div className="flex justify-center">
                    <img src={mediaPreview} alt="预览" className="max-h-48 rounded-md object-contain" />
                  </div>
                ) : (
                  <div className="flex justify-center">
                    <video src={mediaPreview} className="max-h-48 rounded-md object-contain" controls />
                  </div>
                )}
              </div>
              
              <div className="mt-3 text-xs text-gray-500 text-center">
                {mediaType === 'audio' ? "音频文件将与您的消息一起发送" :
                 mediaType === 'video' ? "点击发送按钮将视频与消息一起发送" :
                 "图像将与您的消息一起发送"}
              </div>
            </div>
          </div>
        )}
        
        <div className={`
          relative shadow-lg rounded-lg border border-gray-200 transition-all duration-300
          ${position === 'center' 
            ? 'focus-within:border-blue-400 focus-within:ring-4 focus-within:ring-blue-100 transform hover:shadow-xl' 
            : 'focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100'}
        `}>
          <textarea
            className={`
              w-full p-4 pr-16 rounded-lg border-none focus:outline-none resize-none bg-white
              transition-all duration-300
              ${position === 'center' ? 'min-h-[100px]' : 'min-h-[60px]'} 
              ${position === 'center' ? 'max-h-[200px]' : 'max-h-[150px]'}
            `}
            rows={1}
            placeholder={position === 'center' ? '输入问题，开始与智能助手对话...' : '有什么可以帮助你的？'}
            value={message}
            onChange={(e) => {
              setMessage(e.target.value);
              // 自动调整高度
              e.target.style.height = 'auto';
              const maxHeight = position === 'center' ? 200 : 150;
              const minHeight = position === 'center' ? 100 : 60;
              e.target.style.height = Math.min(maxHeight, Math.max(minHeight, e.target.scrollHeight)) + 'px';
            }}
            onKeyDown={handleKeyDown}
          />
          <div className="absolute bottom-2 right-2 flex space-x-2">
            <div className="flex space-x-1 mr-1">
              <button 
                className="p-2 rounded-md hover:bg-gray-100 text-gray-500 transition-colors"
                onClick={() => setShowAudioRecorder(!showAudioRecorder)}
                title="录音"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              </button>
              
              <button 
                className="p-2 rounded-md hover:bg-gray-100 text-gray-500 transition-colors"
                onClick={() => setShowVideoRecorder(!showVideoRecorder)}
                title="录像"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
              
              <button 
                className="p-2 rounded-md hover:bg-gray-100 text-gray-500 transition-colors"
                onClick={() => setShowPhotoCapture(!showPhotoCapture)}
                title="拍照"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
              
              <label 
                className="p-2 rounded-md hover:bg-gray-100 text-gray-500 transition-colors cursor-pointer"
                title="上传文件"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                </svg>
                <input 
                  type="file" 
                  className="hidden" 
                  accept="image/*,audio/*,video/*"
                  onChange={handleFileSelect}
                  ref={fileInputRef}
                />
              </label>
            </div>
            
            <button
              onClick={handleSendMessage}
              className={`p-2 rounded-md transition-colors flex items-center justify-center ${
                !message.trim() && !mediaFile 
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed' 
                  : 'bg-blue-500 text-white hover:bg-blue-600'
              }`}
              disabled={!message.trim() && !mediaFile}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
              </svg>
            </button>
          </div>
        </div>
      </div>
      
      <AudioRecorder 
        onAudioCaptured={handleAudioCaptured}
        onCancel={() => setShowAudioRecorder(false)}
        isOpen={showAudioRecorder}
        onToggle={() => setShowAudioRecorder(!showAudioRecorder)}
      />
      
      <VideoRecorder 
        onVideoCaptured={handleVideoCaptured}
        onCancel={() => setShowVideoRecorder(false)}
        isOpen={showVideoRecorder}
        onToggle={() => setShowVideoRecorder(!showVideoRecorder)}
      />
      
      <PhotoCapture
        onPhotoCaptured={handlePhotoCaptured}
        onCancel={() => setShowPhotoCapture(false)}
        isOpen={showPhotoCapture}
        onToggle={() => setShowPhotoCapture(!showPhotoCapture)}
      />
    </>
  );
} 