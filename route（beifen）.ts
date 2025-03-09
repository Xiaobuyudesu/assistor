import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

// 创建OpenAI客户端
const createOpenAIClient = () => {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  
  if (!apiKey) {
    throw new Error('API密钥未设置，请在.env.local文件中设置DASHSCOPE_API_KEY');
  }
  
  return new OpenAI({
    apiKey,
    baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1"
  });
};

// 创建流式响应
const createStream = async (stream: any) => {
  const encoder = new TextEncoder();
  const customReadable = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          if (Array.isArray(chunk.choices) && chunk.choices.length > 0) {
            const content = chunk.choices[0].delta.content;
            if (content) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`));
            }
          } else if (chunk.usage) {
            // 可选：发送用量信息
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ usage: chunk.usage })}\n\n`));
          }
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      } catch (error) {
        console.error('[Stream Error]:', error);
        const errorMessage = error instanceof Error ? error.message : '未知错误';
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: errorMessage })}\n\n`));
        controller.close();
      }
    }
  });
  
  return customReadable;
};

// 构建base64完整URL
function getBase64DataUrl(mediaType: string, mediaData: string, mediaFormat: string): string {
  if (!mediaData) return '';
  
  switch (mediaType) {
    case 'image':
      return `data:image/${mediaFormat || 'png'};base64,${mediaData}`;
    case 'audio':
      return `data:audio/${mediaFormat || 'mp3'};base64,${mediaData}`;
    case 'video':
      return `data:video/${mediaFormat || 'mp4'};base64,${mediaData}`;
    default:
      return '';
  }
}

// 验证消息格式是否符合要求
function validateAndFormatMessage(message: any): any {
  if (!message || typeof message !== 'object') {
    return null;
  }
  
  // 确保消息有有效的role
  if (!message.role || !['system', 'user', 'assistant'].includes(message.role)) {
    return null;
  }
  
  // 处理不同角色的消息格式
  if (message.role === 'system' || message.role === 'assistant') {
    // 系统消息和助手消息必须有字符串内容
    if (typeof message.content !== 'string' || !message.content.trim()) {
      return {
        role: message.role,
        content: message.role === 'system' ? 'You are a helpful assistant.' : '我可以帮助你解决问题'
      };
    }
    return {
      role: message.role,
      content: message.content
    };
  }
  
  // 用户消息可以有更复杂的内容格式
  if (message.role === 'user') {
    // 如果已经是正确的数组格式，保持不变
    if (Array.isArray(message.content)) {
      return message;
    }
    
    // 如果是字符串，转换为规范格式
    if (typeof message.content === 'string' && message.content.trim()) {
      return {
        role: 'user',
        content: [{ type: 'text', text: message.content.trim() }]
      };
    }
    
    // 缺少内容，添加默认内容
    return {
      role: 'user',
      content: [{ type: 'text', text: '你好' }]
    };
  }
  
  return null;
}

export async function POST(req: NextRequest) {
  try {
    // 解析请求体
    const requestData = await req.json();
    const { messages, media } = requestData;
    
    console.log('[API Request]:', {
      messageCount: messages?.length,
      hasMedia: !!media
    });
    
    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: '无效的消息格式' }, { status: 400 });
    }
    
    // 创建OpenAI客户端
    const openai = createOpenAIClient();
    
    // 准备消息格式，确保系统消息也使用数组格式
    let formattedMessages = messages.map(msg => {
      // 确保系统消息使用数组格式
      if (msg.role === 'system' && typeof msg.content === 'string') {
        return {
          role: 'system',
          content: [{ type: 'text', text: msg.content }]
        };
      }
      
      // 确保用户消息使用数组格式
      if (msg.role === 'user' && typeof msg.content === 'string') {
        return {
          role: 'user',
          content: [{ type: 'text', text: msg.content }]
        };
      }
      
      // 如果已经是数组格式，直接返回
      return msg;
    });
    
    // 处理媒体（如果有）
    if (media) {
      const lastUserMessageIndex = formattedMessages.length - 1;
      
      // 确保最后一条消息是用户消息
      if (formattedMessages[lastUserMessageIndex].role !== 'user') {
        formattedMessages.push({
          role: 'user',
          content: []
        });
      }
      
      const lastUserMessage = formattedMessages[formattedMessages.length - 1];
      let userContent = Array.isArray(lastUserMessage.content) ? [...lastUserMessage.content] : [];
      
      // 根据媒体类型添加不同的内容
      if (media.type === 'image') {
        userContent.unshift({
          type: 'image_url',
          image_url: { url: `data:image/${media.format || 'png'};base64,${media.data}` }
        });
      } else if (media.type === 'audio') {
        userContent.unshift({
          type: 'input_audio',
          input_audio: { data: `data:;base64,${media.data}`, format: media.format || 'mp3' }
        });
      } else if (media.type === 'video') {
        userContent.unshift({
          type: 'video_url',
          video_url: { url: `data:;base64,${media.data}` }
        });
      }
      
      // 更新用户消息
      formattedMessages[formattedMessages.length - 1].content = userContent;
    }
    
    console.log('[API] 发送到模型的消息结构:', 
      formattedMessages.map(m => ({ role: m.role, contentTypes: Array.isArray(m.content) ? 
        m.content.map((c: any) => c.type) : typeof m.content }))
    );
    
    try {
      // 创建聊天补全请求
      const completion = await openai.chat.completions.create({
        model: "qwen-omni-turbo",
        messages: formattedMessages,
        stream: true,
        stream_options: {
          include_usage: true
        },
        modalities: ["text"],
      });
      
      // 创建流式响应
      const readableStream = await createStream(completion);
      
      return new NextResponse(readableStream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        }
      });
    } catch (error: any) {
      console.error('[API OpenAI Error]:', error);
      
      let errorMessage = '调用AI服务失败';
      let statusCode = 500;
      
      if (error.response) {
        statusCode = error.response.status;
        try {
          const errorBody = await error.response.json();
          errorMessage = errorBody.error || errorBody.message || '调用AI服务失败';
        } catch (e) {
          errorMessage = `AI服务错误 (状态码: ${statusCode})`;
        }
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      return NextResponse.json({ error: errorMessage }, { status: statusCode });
    }
  } catch (error: any) {
    console.error('[API Request Error]:', error);
    return NextResponse.json({ error: error.message || '处理请求失败' }, { status: 500 });
  }
} 