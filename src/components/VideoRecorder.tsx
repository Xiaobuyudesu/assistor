'use client';

import { useState, useRef, useEffect } from 'react';
import { Dialog } from '@headlessui/react';

// 不再需要压缩选项类型
interface VideoRecorderProps {
  onVideoCaptured: (videoBlob: Blob) => void;
  onCancel: () => void;
  isOpen: boolean;
  onToggle: () => void;
}

export default function VideoRecorder({ onVideoCaptured, onCancel, isOpen, onToggle }: VideoRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const videoChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const [processedVideoUrl, setProcessedVideoUrl] = useState('');
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [processingMessage, setProcessingMessage] = useState('');
  const [processedVideo, setProcessedVideo] = useState<File | null>(null);
  const recordingStartTimeRef = useRef<number>(0);
  const [duration, setDuration] = useState(0);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // 组件打开时启动摄像头
    if (isOpen && !streamRef.current) {
      startCamera();
    }
    
    // 组件卸载时清理资源
    return () => {
      cleanupResources();
    };
  }, [isOpen]);

  const cleanupResources = () => {
    // 停止所有媒体轨道
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    // 清除计时器
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: {
          width: { ideal: 480 },  // 进一步降低分辨率
          height: { ideal: 360 }, // 标准16:9比例
          frameRate: { ideal: 15, max: 20 } // 降低帧率
        },
        audio: {
          echoCancellation: true, // 启用回声消除
          noiseSuppression: true, // 启用噪音抑制
          sampleRate: 44100,     // 标准音频采样率
          channelCount: 1        // 单声道音频
        } 
      });
      
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true; // 避免回声
      }
    } catch (error) {
      console.error('无法访问摄像头或麦克风:', error);
      alert('无法访问摄像头或麦克风，请确保您已授予权限。');
      onCancel();
    }
  };

  const handleRecordButtonClick = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const mediaRecorder_onstop = async (chunks: Blob[]) => {
    setIsProcessing(true);
    
    try {
      // 尝试获取MIME类型
      let mimeType = 'video/mp4'; // 首选MP4格式
      
      // 检查录制的实际MIME类型
      if (chunks.length > 0 && chunks[0].type) {
        mimeType = chunks[0].type; // 使用实际录制的MIME类型
      }
      
      // 合并视频块
      const blob = new Blob(chunks, { type: mimeType });
      
      // 获取视频的大小（MB）
      const sizeMB = blob.size / (1024 * 1024);
      console.log(`视频格式: ${mimeType}, 大小: ${sizeMB.toFixed(2)} MB`);
      
      // 直接使用原始视频
      setProcessingMessage('正在准备视频...');
      
      // 创建URL以预览视频
      const videoUrl = URL.createObjectURL(blob);
      setProcessedVideoUrl(videoUrl);
      
      // 根据实际格式确定文件扩展名
      let extension = 'mp4';
      if (mimeType.includes('webm')) {
        extension = 'webm';
      }
      
      // 将blob转换为File对象
      const fileName = `recording_${new Date().getTime()}.${extension}`;
      const videoFile = new File([blob], fileName, { type: mimeType });
      
      // 延迟设置处理完成，以便UI更新
      setTimeout(() => {
        setProcessedVideo(videoFile);
        setIsProcessing(false);
        setProcessingMessage('');
      }, 500);
    } catch (error) {
      console.error('视频处理错误:', error);
      setRecordingError('视频处理时出错，请重试');
      setIsProcessing(false);
      setProcessingMessage('');
    }
  };

  const startRecording = async () => {
    try {
      if (!streamRef.current) {
        await startCamera();
      }

      setIsRecording(true);
      setRecordingTime(0);
      recordingStartTimeRef.current = Date.now();
      setRecordingError(null);
      setProcessedVideoUrl('');

      // 确保视频元素准备就绪
      if (videoRef.current && streamRef.current) {
        // 优先尝试使用MP4格式，这对多数API更友好
        let mimeType = 'video/mp4';
        let options = {};
        
        // 如果不支持MP4，回退到尝试其他常见格式
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = 'video/webm;codecs=h264'; // 尝试H264编码
          
          if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = 'video/webm;codecs=vp8'; // 回退到VP8
            
            if (!MediaRecorder.isTypeSupported(mimeType)) {
              mimeType = 'video/webm'; // 基本WebM格式
              
              if (!MediaRecorder.isTypeSupported(mimeType)) {
                mimeType = ''; // 最后使用默认格式
              }
            }
          }
        }
        
        // 使用极低的比特率来确保文件较小
        if (mimeType) {
          options = { 
            mimeType, 
            videoBitsPerSecond: 250000 // 降低到250Kbps提高兼容性
          };
        }

        try {
          const mediaRecorder = new MediaRecorder(streamRef.current, options);
          mediaRecorderRef.current = mediaRecorder;
          
          const chunks: Blob[] = [];
          
          mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
              chunks.push(e.data);
            }
          };
  
          mediaRecorder.onstop = () => mediaRecorder_onstop(chunks);
  
          mediaRecorder.start(100); // 每100ms保存一个数据块
        } catch (err) {
          console.warn('无法使用指定的编码器，尝试使用默认设置');
          // 使用默认设置尝试
          const mediaRecorder = new MediaRecorder(streamRef.current);
          mediaRecorderRef.current = mediaRecorder;
          
          const chunks: Blob[] = [];
          
          mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
              chunks.push(e.data);
            }
          };
  
          mediaRecorder.onstop = () => mediaRecorder_onstop(chunks);
  
          mediaRecorder.start(100);
        }
        
        // 设置录制时长限制为30秒（缩短最大时长）
        recordingTimerRef.current = setInterval(() => {
          const elapsed = Math.floor((Date.now() - recordingStartTimeRef.current) / 1000);
          setRecordingTime(elapsed);
          
          // 到达最大时长时自动停止
          if (elapsed >= 30) {
            stopRecording();
            clearInterval(recordingTimerRef.current!);
          }
        }, 1000);
      }
    } catch (error) {
      console.error('开始录制时出错:', error);
      setRecordingError('无法开始录制，请检查摄像头权限');
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
    }
  };

  const handleCancel = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
    }
    
    cleanupResources();
    setIsRecording(false);
    setRecordingTime(0);
    onCancel();
  };

  // 格式化时间显示为 MM:SS
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // 丢弃录制的视频，重新开始
  const discardRecording = () => {
    if (processedVideoUrl) {
      URL.revokeObjectURL(processedVideoUrl);
    }
    
    setProcessedVideo(null);
    setProcessedVideoUrl('');
    setRecordingTime(0);
    setRecordingError(null);
  };

  // 确认选择视频
  const confirmVideo = () => {
    if (processedVideo) {
      onVideoCaptured(processedVideo);
      onToggle();
    }
  };

  if (!isOpen) return null;

  return (
    <Dialog 
      open={isOpen} 
      onClose={handleCancel}
      className="relative z-50"
    >
      <div className="fixed inset-0 bg-black/75" aria-hidden="true" />
      
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <Dialog.Panel className="w-full max-w-md rounded-xl bg-white shadow-xl">
          <div className="p-5">
            <Dialog.Title className="text-lg font-medium text-gray-900 mb-2">
              {processedVideoUrl ? '预览录制的视频' : '录制视频'}
            </Dialog.Title>
            
            <div className="relative bg-black rounded-lg overflow-hidden aspect-video mb-4">
              {/* 录制时的视频预览 */}
              {!processedVideoUrl && (
                <video
                  ref={videoRef}
                  className="w-full h-full object-cover"
                  autoPlay
                  playsInline
                  muted
                />
              )}
              
              {/* 录制完成后的视频预览 */}
              {processedVideoUrl && (
                <video
                  className="w-full h-full object-contain"
                  src={processedVideoUrl}
                  controls
                  autoPlay
                />
              )}
              
              {/* 录制状态指示器 */}
              {isRecording && (
                <div className="absolute top-2 right-2 flex items-center bg-black/50 text-white px-2 py-1 rounded">
                  <div className="w-3 h-3 bg-red-500 rounded-full mr-2 animate-pulse"></div>
                  <span className="text-sm font-medium">{formatTime(recordingTime)}</span>
                </div>
              )}
              
              {/* 处理中状态 */}
              {isProcessing && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 text-white">
                  <div className="w-10 h-10 border-4 border-t-blue-500 border-blue-300 rounded-full animate-spin mb-4"></div>
                  <p className="text-sm font-medium">{processingMessage || '处理视频中...'}</p>
                </div>
              )}
              
              {/* 错误信息 */}
              {recordingError && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/70">
                  <div className="text-center text-white p-4">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-red-500 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-sm">{recordingError}</p>
                  </div>
                </div>
              )}
            </div>
            
            {/* 操作按钮 */}
            <div className="flex justify-between">
              {!processedVideoUrl ? (
                <>
                  <button
                    type="button"
                    onClick={handleCancel}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    取消
                  </button>
                  
                  {isRecording ? (
                    <button
                      type="button"
                      onClick={stopRecording}
                      className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                    >
                      停止录制
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={startRecording}
                      className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                      disabled={isProcessing}
                    >
                      开始录制
                    </button>
                  )}
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={discardRecording}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
                  >
                    重新录制
                  </button>
                  
                  <button
                    type="button"
                    onClick={confirmVideo}
                    className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                  >
                    使用此视频
                  </button>
                </>
              )}
            </div>
            
            {/* 提示信息 */}
            <div className="mt-3 text-xs text-center text-gray-500">
              {!processedVideoUrl 
                ? (isRecording 
                    ? "最长录制时间为30秒。保持视频简短（10-15秒）可显著提高上传成功率。" 
                    : "请录制简短视频（建议5-15秒）。视频越短越易于上传成功。")
                : "视频已准备完成。请注意：API仅支持简短的低分辨率视频，如上传失败请尝试录制更短的视频。"}
            </div>
          </div>
        </Dialog.Panel>
      </div>
    </Dialog>
  );
} 