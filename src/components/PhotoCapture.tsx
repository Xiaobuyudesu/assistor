'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Dialog } from '@headlessui/react';
import { resizeImage } from '@/utils/mediaUtils';

interface PhotoCaptureProps {
  isOpen: boolean;
  onToggle: () => void;
  onPhotoCaptured: (photo: File) => void;
  onCancel: () => void;
}

export default function PhotoCapture({ 
  isOpen, 
  onToggle, 
  onPhotoCaptured, 
  onCancel 
}: PhotoCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // 启动相机
  const startCamera = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });
      
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      
      setIsLoading(false);
    } catch (err) {
      console.error('相机访问错误:', err);
      setError('无法访问相机，请确保已授予相机权限并重试。');
      setIsLoading(false);
    }
  };
  
  // 停止相机
  const stopCamera = () => {
    if (streamRef.current) {
      const tracks = streamRef.current.getTracks();
      tracks.forEach(track => track.stop());
      streamRef.current = null;
    }
    
    if (capturedImage) {
      URL.revokeObjectURL(capturedImage);
      setCapturedImage(null);
    }
  };
  
  // 捕获照片
  const capturePhoto = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    
    setIsProcessing(true);
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    // 设置画布尺寸与视频匹配
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    // 在画布上绘制当前视频帧
    const context = canvas.getContext('2d');
    if (context) {
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      try {
        // 获取图像数据
        canvas.toBlob(async (blob) => {
          if (!blob) {
            setError('无法捕获图像，请重试');
            setIsProcessing(false);
            return;
          }
          
          try {
            // 优化图像大小
            const optimizedBlob = await resizeImage(blob, 1280, 720, 0.85);
            
            // 创建预览URL
            const imageUrl = URL.createObjectURL(optimizedBlob);
            setCapturedImage(imageUrl);
            
            // 创建文件对象
            const photoFile = new File(
              [optimizedBlob], 
              `photo_${new Date().getTime()}.jpg`, 
              { type: 'image/jpeg' }
            );
            
            setIsProcessing(false);
          } catch (err) {
            console.error('图像处理错误:', err);
            setError('图像处理失败，请重试');
            setIsProcessing(false);
          }
        }, 'image/jpeg', 0.95);
      } catch (err) {
        console.error('canvas错误:', err);
        setError('图像捕获失败，请重试');
        setIsProcessing(false);
      }
    }
  };
  
  // 重新拍照
  const retakePhoto = () => {
    if (capturedImage) {
      URL.revokeObjectURL(capturedImage);
      setCapturedImage(null);
    }
  };
  
  // 确认使用照片
  const confirmPhoto = async () => {
    if (!capturedImage || !canvasRef.current) return;
    
    setIsProcessing(true);
    
    try {
      // 从画布获取最终图像
      canvasRef.current.toBlob(async (blob) => {
        if (!blob) {
          setError('无法处理图像，请重试');
          setIsProcessing(false);
          return;
        }
        
        try {
          // 优化图像大小
          const optimizedBlob = await resizeImage(blob, 1280, 720, 0.85);
          
          // 创建文件对象
          const photoFile = new File(
            [optimizedBlob], 
            `photo_${new Date().getTime()}.jpg`, 
            { type: 'image/jpeg' }
          );
          
          // 向上传递照片File对象
          onPhotoCaptured(photoFile);
          
          // 关闭对话框并清理资源
          handleClose();
        } catch (err) {
          console.error('图像处理错误:', err);
          setError('图像处理失败，请重试');
          setIsProcessing(false);
        }
      }, 'image/jpeg', 0.9);
    } catch (err) {
      console.error('canvas错误:', err);
      setError('图像处理失败，请重试');
      setIsProcessing(false);
    }
  };
  
  // 关闭并清理
  const handleClose = () => {
    stopCamera();
    setError(null);
    setIsProcessing(false);
    onToggle();
  };
  
  // 处理取消操作
  const handleCancel = () => {
    stopCamera();
    onCancel();
  };
  
  // 组件挂载时启动相机
  useEffect(() => {
    if (isOpen) {
      startCamera();
    }
    
    // 组件卸载时清理资源
    return () => {
      stopCamera();
    };
  }, [isOpen]);
  
  if (!isOpen) return null;
  
  return (
    <Dialog 
      open={isOpen} 
      onClose={handleClose}
      className="relative z-50"
    >
      <div className="fixed inset-0 bg-black/75" aria-hidden="true" />
      
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <Dialog.Panel className="w-full max-w-md rounded-xl bg-white shadow-xl">
          <div className="p-5">
            <Dialog.Title className="text-lg font-medium text-gray-900 mb-2">
              {capturedImage ? '预览照片' : '拍摄照片'}
            </Dialog.Title>
            
            <div className="relative bg-black rounded-lg overflow-hidden aspect-video mb-4">
              {/* 相机预览 */}
              {!capturedImage && (
                <video
                  ref={videoRef}
                  className="w-full h-full object-cover"
                  autoPlay
                  playsInline
                  muted
                />
              )}
              
              {/* 照片预览 */}
              {capturedImage && (
                <img
                  src={capturedImage}
                  alt="拍摄的照片"
                  className="w-full h-full object-contain"
                />
              )}
              
              {/* 隐藏的Canvas用于图像处理 */}
              <canvas 
                ref={canvasRef}
                className="hidden"
              />
              
              {/* 加载状态 */}
              {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/70">
                  <div className="w-10 h-10 border-4 border-t-blue-500 border-blue-300 rounded-full animate-spin"></div>
                </div>
              )}
              
              {/* 处理中状态 */}
              {isProcessing && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 text-white">
                  <div className="w-10 h-10 border-4 border-t-blue-500 border-blue-300 rounded-full animate-spin mb-4"></div>
                  <p className="text-sm font-medium">处理照片中...</p>
                </div>
              )}
              
              {/* 错误信息 */}
              {error && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/70">
                  <div className="text-center text-white p-4">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-red-500 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-sm">{error}</p>
                  </div>
                </div>
              )}
            </div>
            
            {/* 操作按钮 */}
            <div className="flex justify-between">
              {!capturedImage ? (
                <>
                  <button
                    type="button"
                    onClick={handleCancel}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    取消
                  </button>
                  
                  <button
                    type="button"
                    onClick={capturePhoto}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                    disabled={isLoading || isProcessing}
                  >
                    拍照
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={retakePhoto}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
                  >
                    重新拍摄
                  </button>
                  
                  <button
                    type="button"
                    onClick={confirmPhoto}
                    className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                  >
                    使用此照片
                  </button>
                </>
              )}
            </div>
            
            {/* 提示信息 */}
            <div className="mt-3 text-xs text-center text-gray-500">
              {!capturedImage 
                ? "请确保光线充足并保持相机稳定" 
                : "照片已拍摄，您可以确认使用或重新拍摄"}
            </div>
          </div>
        </Dialog.Panel>
      </div>
    </Dialog>
  );
} 