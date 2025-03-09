/**
 * 媒体文件处理工具函数
 * 包含视频压缩、格式转换等功能
 */

/**
 * 将视频文件压缩和转换为API所需的格式
 * @param videoBlob 原始视频Blob对象
 * @param options 压缩选项
 * @returns 压缩后的视频Blob
 */
export const compressVideo = async (
  videoBlob: Blob,
  options: {
    maxWidth?: number;
    maxHeight?: number;
    targetSize?: number; // 目标文件大小 (bytes)
    targetFormat?: string; // 目标格式 ('mp4', 'webm')
    quality?: number; // 质量，0-1之间
    frameRate?: number; // 帧率
  } = {}
): Promise<Blob> => {
  const {
    maxWidth = 640,
    maxHeight = 480,
    targetFormat = 'webm', // 默认使用webm格式，通常与API更兼容
    quality = 0.8,
    frameRate = 24
  } = options;

  return new Promise((resolve, reject) => {
    try {
      // 创建视频元素
      const video = document.createElement('video');
      video.style.display = 'none';
      video.muted = true;
      video.autoplay = false;
      
      // 创建blob URL
      const videoUrl = URL.createObjectURL(videoBlob);
      video.src = videoUrl;
      
      // 视频元数据加载完成后处理
      video.onloadedmetadata = () => {
        document.body.appendChild(video);
        
        // 计算缩放后的尺寸，保持宽高比
        let width = video.videoWidth;
        let height = video.videoHeight;
        
        if (width > maxWidth || height > maxHeight) {
          const aspectRatio = width / height;
          
          if (width > height) {
            width = maxWidth;
            height = Math.floor(width / aspectRatio);
          } else {
            height = maxHeight;
            width = Math.floor(height * aspectRatio);
          }
        }
        
        // 保存视频时长，确保完整捕获所有帧
        const videoDuration = video.duration;
        console.log(`原始视频时长: ${videoDuration.toFixed(2)}秒`);
        
        // 创建canvas用于绘制视频帧
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        
        // 创建MediaRecorder来捕获canvas内容
        const stream = canvas.captureStream(frameRate);
        
        // 尝试添加原视频的音轨
        const audioContext = new AudioContext();
        const audioDestination = audioContext.createMediaStreamDestination();
        
        // 声明recorder变量供后续使用
        let recorder: MediaRecorder;
        
        // 播放视频并通过canvas重新编码
        video.onplay = () => {
          // 尝试获取音频轨道
          try {
            // 使用类型断言处理可能不支持的captureStream方法
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const videoWithCapture = video as any;
            if (typeof videoWithCapture.captureStream === 'function') {
              const audioTracks = videoWithCapture.captureStream().getAudioTracks();
              if (audioTracks && audioTracks.length > 0) {
                audioTracks.forEach((track: MediaStreamTrack) => stream.addTrack(track));
              }
            }
          } catch (e) {
            console.warn('无法捕获原视频的音频轨道:', e);
          }
          
          // 设置MediaRecorder选项
          // 尝试不同的格式，确保API兼容性
          let mimeType: string;
          let recorderOptions: MediaRecorderOptions = { 
            videoBitsPerSecond: 500000 // 使用更低的比特率提高兼容性
          };
          
          // 首先尝试webm格式，这是大多数API接受的格式
          if (targetFormat === 'webm') {
            mimeType = 'video/webm;codecs=vp8'; // 使用vp8而非vp9，更广泛支持
            
            if (!MediaRecorder.isTypeSupported(mimeType)) {
              mimeType = 'video/webm'; // 尝试基本webm格式
            }
          } else {
            // 尝试mp4格式
            mimeType = 'video/mp4';
            
            // 如果不支持，回退到webm
            if (!MediaRecorder.isTypeSupported(mimeType)) {
              mimeType = 'video/webm';
            }
          }
          
          // 如果找到支持的MIME类型，设置到选项中
          if (MediaRecorder.isTypeSupported(mimeType)) {
            recorderOptions.mimeType = mimeType;
          }
          
          try {
            recorder = new MediaRecorder(stream, recorderOptions);
          } catch (e) {
            // 如果创建recorder失败，尝试使用默认选项
            console.warn('无法使用自定义选项创建MediaRecorder，使用默认设置:', e);
            recorder = new MediaRecorder(stream);
          }
          
          const chunks: Blob[] = [];
          
          recorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
              chunks.push(e.data);
            }
          };
          
          recorder.onstop = () => {
            // 根据目标格式设置输出类型
            let outputType = 'video/webm';
            if (targetFormat === 'mp4' && MediaRecorder.isTypeSupported('video/mp4')) {
              outputType = 'video/mp4';
            }
            
            const compressedBlob = new Blob(chunks, { type: outputType });
            
            URL.revokeObjectURL(videoUrl);
            document.body.removeChild(video);
            console.log(`压缩后视频大小: ${(compressedBlob.size / (1024 * 1024)).toFixed(2)} MB`);
            resolve(compressedBlob);
          };
          
          // 开始录制
          recorder.start(100); // 每100ms保存一个数据块
          
          // 跟踪时间以确保完整录制
          let elapsedTime = 0;
          const captureInterval = 10; // 检查间隔，毫秒
          
          // 绘制视频帧到canvas
          const drawFrame = () => {
            if (ctx) {
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            }
            
            if (!video.paused && !video.ended) {
              requestAnimationFrame(drawFrame);
            }
          };
          
          drawFrame();
          
          // 使用定时器确保即使视频播放有问题也能完成录制
          const processTimer = setInterval(() => {
            elapsedTime += captureInterval;
            
            // 如果视频已结束或播放时间超过原视频时长，停止录制
            if (video.ended || elapsedTime >= videoDuration * 1000 + 500) { // 额外添加500ms缓冲
              clearInterval(processTimer);
              
              if (recorder && recorder.state !== 'inactive') {
                console.log(`完成视频处理，总时长: ${elapsedTime/1000}秒`);
                recorder.stop();
              }
            }
          }, captureInterval);
        };
        
        // 处理视频结束事件 - 仍然保留但不作为主要结束判断
        video.onended = () => {
          console.log('视频播放结束事件触发');
          // 不在这里停止录制，由定时器决定何时停止
        };
        
        // 视频处理错误
        video.onerror = (e) => {
          URL.revokeObjectURL(videoUrl);
          if (document.body.contains(video)) {
            document.body.removeChild(video);
          }
          reject(new Error(`视频处理错误: ${e}`));
        };
        
        // 播放视频触发处理流程
        video.play().catch(err => {
          console.error('视频播放失败:', err);
          URL.revokeObjectURL(videoUrl);
          reject(new Error(`视频播放失败: ${err}`));
        });
      };
      
      // 元数据加载出错
      video.onerror = (e) => {
        URL.revokeObjectURL(videoUrl);
        reject(new Error(`视频加载错误: ${e}`));
      };
    } catch (error) {
      console.error('视频压缩失败:', error);
      reject(error);
    }
  });
};

/**
 * 将图像调整到指定的最大尺寸，保持宽高比
 * @param imageBlob 原始图像Blob
 * @param maxWidth 最大宽度
 * @param maxHeight 最大高度
 * @param quality 压缩质量 (0-1)
 * @returns 调整后的图像Blob
 */
export const resizeImage = async (
  imageBlob: Blob,
  maxWidth = 1280,
  maxHeight = 720,
  quality = 0.8
): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let width = img.width;
      let height = img.height;
      
      // 计算调整后的尺寸
      if (width > maxWidth || height > maxHeight) {
        const aspectRatio = width / height;
        
        if (width > height) {
          width = maxWidth;
          height = Math.floor(width / aspectRatio);
        } else {
          height = maxHeight;
          width = Math.floor(height * aspectRatio);
        }
      }
      
      // 创建canvas并绘制调整后的图像
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0, width, height);
      
      // 将canvas转换为Blob
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('图像处理失败'));
          }
        },
        'image/jpeg',
        quality
      );
    };
    
    img.onerror = () => reject(new Error('图像加载失败'));
    img.src = URL.createObjectURL(imageBlob);
  });
};

/**
 * 将音频转换为指定格式
 * @param audioBlob 原始音频Blob
 * @param targetFormat 目标格式 ('mp3', 'wav', 'ogg')
 * @returns 转换后的音频Blob
 */
export const convertAudioFormat = async (
  audioBlob: Blob,
  targetFormat = 'mp3'
): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    try {
      // 实际场景中，音频格式转换通常需要服务器端支持
      // 或使用专门的Web Audio API库
      // 此处简化为直接更改MIME类型
      
      const supportedFormats: Record<string, string> = {
        // 使用与通义千问API一致的MIME类型
        'mp3': 'audio/mp3',
        'wav': 'audio/wav',
        'ogg': 'audio/ogg'
      };
      
      const mimeType = supportedFormats[targetFormat] || 'audio/mp3';
      resolve(new Blob([audioBlob], { type: mimeType }));
    } catch (error) {
      reject(error);
    }
  });
};

/**
 * 检查文件大小是否符合API限制
 * @param blob 文件Blob
 * @param maxSizeInMB 最大大小 (MB)
 * @returns 是否符合大小限制
 */
export const checkFileSize = (blob: Blob, maxSizeInMB: number): boolean => {
  const maxSizeInBytes = maxSizeInMB * 1024 * 1024;
  return blob.size <= maxSizeInBytes;
};

/**
 * 从Blob创建可用于预览的URL
 * @param blob 文件Blob
 * @returns 预览URL
 */
export const createPreviewUrl = (blob: Blob): string => {
  return URL.createObjectURL(blob);
};

/**
 * 释放之前创建的预览URL，避免内存泄漏
 * @param url 预览URL
 */
export const revokePreviewUrl = (url: string): void => {
  URL.revokeObjectURL(url);
}; 