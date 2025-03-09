import OpenAI from "openai";

// 创建OpenAI客户端实例
export const createOpenAIClient = () => {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  
  if (!apiKey) {
    throw new Error('API密钥未设置，请在.env.local文件中设置DASHSCOPE_API_KEY');
  }
  
  return new OpenAI({
    apiKey,
    baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1"
  });
};

// 文本消息请求
export const sendTextMessage = async (messages: any[], onUpdate: (text: string) => void) => {
  const openai = createOpenAIClient();
  
  try {
    const completion = await openai.chat.completions.create({
      model: "qwen-omni-turbo",
      messages,
      stream: true,
      stream_options: {
        include_usage: true
      },
      modalities: ["text"],
    });

    let responseText = '';
    
    for await (const chunk of completion) {
      if (Array.isArray(chunk.choices) && chunk.choices.length > 0 && chunk.choices[0].delta.content) {
        responseText += chunk.choices[0].delta.content;
        onUpdate(responseText);
      }
    }
    
    return responseText;
  } catch (error: any) {
    console.error('发送文本消息错误:', error);
    
    // 提取错误信息
    let errorMessage = '发送消息失败';
    if (error.response) {
      try {
        const errorData = await error.response.json();
        errorMessage = errorData.error || errorData.message || '发送消息失败';
      } catch (e) {
        errorMessage = `API错误 (${error.response.status})`;
      }
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    // 通知UI层显示错误信息
    onUpdate(`[错误] ${errorMessage}`);
    
    // 重新抛出错误以便调用者处理
    throw new Error(errorMessage);
  }
};

// 将文件转换为Base64编码
export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      let encoded = reader.result?.toString();
      // 仅从data:开头的串中提取base64部分
      if (encoded && encoded.includes('base64,')) {
        encoded = encoded.split('base64,')[1];
        resolve(encoded);
      } else {
        reject(new Error('转换文件为base64失败'));
      }
    };
    reader.onerror = error => reject(error);
  });
};

// 获取文件格式后缀
export const getFileFormat = (file: File): string => {
  if (!file || !file.type) return '';
  const format = file.type.split('/')[1]?.toLowerCase() || '';
  
  // 修正常见的MIME类型
  if (format === 'mpeg' && file.type.startsWith('audio/')) {
    return 'mp3';
  } else if (format === 'quicktime') {
    return 'mp4';
  }
  
  return format;
};

// 获取文件类型分类
export const getFileType = (file: File): 'image' | 'audio' | 'video' | null => {
  if (!file || !file.type) return null;
  
  const mimeType = file.type.toLowerCase();
  
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('video/')) return 'video';
  
  // 根据扩展名判断
  const fileName = file.name.toLowerCase();
  if (/\.(jpg|jpeg|png|gif|webp|bmp|svg)$/.test(fileName)) return 'image';
  if (/\.(mp3|wav|ogg|m4a|aac)$/.test(fileName)) return 'audio';
  if (/\.(mp4|mov|webm|avi|wmv|flv|mkv)$/.test(fileName)) return 'video';
  
  return null;
};

// 验证文件大小 (不超过19MB)
export const validateFileSize = (file: File): boolean => {
  if (!file) return false;
  
  const MAX_SIZE = 19 * 1024 * 1024; // 19MB
  return file.size <= MAX_SIZE;
};

// 验证视频时长 (需要在客户端实现)
export const validateVideoDuration = (file: File): Promise<boolean> => {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    
    video.onloadedmetadata = () => {
      window.URL.revokeObjectURL(video.src);
      resolve(video.duration <= 60); // 不超过60秒
    };
    
    video.src = URL.createObjectURL(file);
  });
};

// 验证URL是否为绝对URL
export const isAbsoluteUrl = (url: string): boolean => {
  if (!url) return false;
  return /^(?:https?:\/\/)/i.test(url);
};

// 确保URL是绝对URL
export const ensureAbsoluteUrl = (url: string): string => {
  if (!url) return '';
  
  // 如果已经是绝对URL，直接返回
  if (isAbsoluteUrl(url)) return url;
  
  // 如果是相对URL，转换为绝对URL
  if (url.startsWith('/')) {
    // 获取当前域名作为基础URL
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    return `${baseUrl}${url}`;
  }
  
  return url;
};

// 测试函数，将媒体文件转换为base64并记录结果
export const testBase64Conversion = async (file: File): Promise<void> => {
  console.log('开始测试媒体文件base64转换');
  console.log('文件信息:', {
    name: file.name,
    type: file.type,
    size: file.size + ' bytes',
    lastModified: new Date(file.lastModified).toISOString()
  });
  
  try {
    const startTime = performance.now();
    const base64Data = await fileToBase64(file);
    const endTime = performance.now();
    
    console.log('base64转换成功:', {
      convertTimeMs: Math.round(endTime - startTime),
      dataLength: base64Data.length,
      sampleStart: base64Data.substring(0, 20) + '...',
      sampleEnd: '...' + base64Data.substring(base64Data.length - 20)
    });
    
    const mediaType = getFileType(file);
    const mediaFormat = getFileFormat(file);
    console.log('媒体文件类型分析:', {
      mediaType,
      mediaFormat
    });
  } catch (error) {
    console.error('base64转换测试失败:', error);
    throw error;
  }
};

// 处理多模态消息发送
export const sendMultiModalMessage = async (
  messages: any[],
  mediaFile: File | null,
  onUpdate: (text: string) => void
) => {
  try {
    // 准备请求数据
    const requestData: any = { messages };
    
    // 如果有媒体文件，处理媒体文件
    if (mediaFile) {
      const mediaType = getFileType(mediaFile);
      const mediaFormat = getFileFormat(mediaFile);
      
      if (mediaType) {
        try {
          // 将文件转换为base64
          const base64Data = await fileToBase64(mediaFile);
          
          // 添加媒体数据
          requestData.media = {
            type: mediaType,
            data: base64Data,
            format: mediaFormat
          };
          
          console.log(`媒体文件已转换为base64，类型: ${mediaType}, 格式: ${mediaFormat}`);
        } catch (error) {
          console.error('转换媒体文件为base64失败:', error);
          throw new Error('处理媒体文件失败');
        }
      }
    }
    
    // 发送API请求
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestData)
    });
    
    if (!response.ok) {
      // 获取错误详情
      const errorDetail = await response.text();
      console.error('API返回错误:', errorDetail);
      
      let errorMessage = `API请求失败 (状态码: ${response.status})`;
      try {
        // 尝试解析错误详情为JSON
        const errorJson = JSON.parse(errorDetail);
        if (errorJson.error) {
          errorMessage = errorJson.error;
        }
      } catch (e) {
        // 如果不是JSON，直接使用错误文本
        errorMessage = errorDetail || errorMessage;
      }
      
      throw new Error(errorMessage);
    }
    
    // 处理流式响应
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let responseText = '';
    
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
                responseText += parsedData.content;
                onUpdate(responseText);
              } else if (parsedData.error) {
                throw new Error(parsedData.error);
              }
            } catch (e) {
              console.error('解析响应数据失败:', e);
            }
          }
        }
      }
    }
    
    return responseText;
  } catch (error: any) {
    console.error('发送多模态消息错误:', error);
    throw error;
  }
};

// 发送文本消息到DeepSeek API
export const sendTextToDeepSeek = async (textContent: string, allMessages: any[], onUpdate?: (text: string) => void): Promise<string> => {
  try {
    // 开始fetching
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: allMessages,
      }),
    });

    if (!response.ok) {
      throw new Error(`API错误: ${response.status}`);
    }

    // 处理服务器发送事件
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('无法读取响应');
    }

    const decoder = new TextDecoder();
    let responseText = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(5);
          if (data === '[DONE]') {
            break;
          }

          try {
            const parsed = JSON.parse(data);
            if (parsed.content) {
              responseText += parsed.content;
              if (onUpdate) {
                onUpdate(responseText);
              }
            }
          } catch (e) {
            console.error('解析SSE数据错误:', e);
          }
        }
      }
    }

    return responseText;
  } catch (error) {
    console.error('发送消息错误:', error);
    throw error;
  }
};

// 使用DeepSeek分析媒体消息
export const analyzeMediaWithDeepSeek = async (mediaFile: File, content: string, allMessages: any[], onUpdate?: (text: string) => void): Promise<string> => {
  try {
    // 获取文件类型和格式
    const type = getFileType(mediaFile);
    const format = mediaFile.name.split('.').pop() || '';
    
    // 转换为base64
    const base64Data = await fileToBase64(mediaFile);
    
    if (!base64Data) {
      throw new Error('文件转换失败');
    }
    
    // 构建请求体
    const requestBody = {
      messages: allMessages,
      media: {
        type,
        data: base64Data,
        format
      }
    };
    
    // 发送请求
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });
    
    if (!response.ok) {
      throw new Error(`API错误: ${response.status}`);
    }
    
    // 处理流式响应
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('无法读取响应');
    }
    
    const decoder = new TextDecoder();
    let responseText = '';
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(5);
          if (data === '[DONE]') {
            break;
          }
          
          try {
            const parsed = JSON.parse(data);
            if (parsed.content) {
              responseText += parsed.content;
              if (onUpdate) {
                onUpdate(responseText);
              }
            }
          } catch (e) {
            console.error('解析SSE数据错误:', e);
          }
        }
      }
    }
    
    return responseText;
  } catch (error) {
    console.error('媒体分析错误:', error);
    throw error;
  }
}; 