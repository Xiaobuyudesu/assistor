import { NextRequest, NextResponse } from 'next/server';

// 调试环境变量加载情况
console.log('[ENV DEBUG] 环境变量加载检查:');
console.log('- ENV_DEBUG:', process.env.ENV_DEBUG);
console.log('- DEEPSEEK_API_KEY 前6位:', process.env.DEEPSEEK_API_KEY?.substring(0, 6) + '...');
console.log('- DEEPSEEK_API_KEY 长度:', process.env.DEEPSEEK_API_KEY?.length);
console.log('- DASHSCOPE_API_KEY 前6位:', process.env.DASHSCOPE_API_KEY?.substring(0, 6) + '...');

import OpenAI from 'openai';

// 创建通义千问客户端（仅用于处理媒体）
const createQwenClient = () => {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  
  if (!apiKey) {
    throw new Error('通义千问API密钥未设置，请在.env.local文件中设置DASHSCOPE_API_KEY');
  }
  
  return new OpenAI({
    apiKey,
    baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1"
  });
};

// 创建DeepSeek客户端（用于处理文本和推理）
const createDeepSeekClient = () => {
  // ⚠️ 临时使用硬编码API密钥进行测试
  // 从.env.local读取的值: sk-7ef61fe9a9ce46439ceb4a2de0fddfa9
  // 但系统检测到的值: sk-76b...
  const apiKey = 'sk-7ef61fe9a9ce46439ceb4a2de0fddfa9'; // 临时硬编码，仅用于测试
  // const apiKey = process.env.DEEPSEEK_API_KEY;
  
  // 详细记录API密钥信息（安全地）
  console.log('[DeepSeek] 环境变量检查:');
  console.log('- API密钥是否存在:', apiKey ? '是' : '否');
  console.log('- API密钥长度:', apiKey?.length || 0);
  console.log('- API密钥来源: 硬编码（临时测试）');
  
  if (!apiKey) {
    console.error('[DeepSeek] 错误: API密钥未设置');
    throw new Error('DeepSeek API密钥未设置，请在.env.local文件中设置DEEPSEEK_API_KEY');
  }
  
  // 检查API密钥格式
  if (!apiKey.startsWith('sk-')) {
    console.error('[DeepSeek] 警告: API密钥格式可能不正确，应以sk-开头');
  }
  
  console.log('[DeepSeek] 使用API密钥创建客户端（前6位）:', apiKey.substring(0, 6) + '...');
  console.log('[DeepSeek] API密钥长度:', apiKey.length);
  
  // 使用标准配置创建DeepSeek客户端
  try {
    const client = new OpenAI({
      apiKey: apiKey,
      baseURL: "https://api.deepseek.com",
      timeout: 60000
    });
    
    return client;
  } catch (error) {
    console.error('[DeepSeek] 创建客户端失败:', error);
    throw new Error('创建DeepSeek客户端失败: ' + (error instanceof Error ? error.message : String(error)));
  }
};

// 创建流式响应，支持思考过程
const createStream = async (stream: any) => {
  const encoder = new TextEncoder();
  let reasoningContent = ''; // 用于存储思考过程
  
  const customReadable = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          // 处理 DeepSeek Reasoner 的思考过程
          if (chunk.choices?.[0]?.delta?.reasoning_content) {
            // 累积思考过程内容
            reasoningContent += chunk.choices[0].delta.reasoning_content;
            // 不向客户端直接发送思考内容，而是包含在可伸缩插件中
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
              reasoning_content: chunk.choices[0].delta.reasoning_content,
              reasoning_expandable: true // 标记为可展开的思考过程
            })}\n\n`));
          } 
          // 处理普通内容
          else if (Array.isArray(chunk.choices) && chunk.choices.length > 0) {
            const content = chunk.choices[0].delta.content;
            if (content) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
                content,
                // 如果存在累积的思考过程，添加标记但不重复发送
                has_reasoning: reasoningContent.length > 0
              })}\n\n`));
            }
          } else if (chunk.usage) {
            // 发送用量信息
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
              usage: chunk.usage,
              // 如果有完整的思考过程且尚未发送，则在最后一个消息中包含
              final_reasoning: reasoningContent.length > 0 ? reasoningContent : undefined
            })}\n\n`));
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
  let mimePrefix = '';
  
  switch (mediaType) {
    case 'image':
      mimePrefix = `data:image/${mediaFormat || 'png'};base64,`;
      break;
    case 'audio':
      mimePrefix = `data:audio/${mediaFormat || 'mp3'};base64,`;
      break;
    case 'video':
      mimePrefix = `data:video/${mediaFormat || 'mp4'};base64,`;
      break;
    default:
      mimePrefix = 'data:;base64,';
  }
  
  return mimePrefix + mediaData;
}

// 验证和格式化消息
function validateAndFormatMessage(message: any): any {
  // 确保消息具有有效的角色
  if (!message || !message.role || !['user', 'assistant', 'system'].includes(message.role)) {
    return {
      role: 'user',
      content: '请分析这个内容'
    };
  }
  
  // 确保内容是字符串类型
  if (message.content === null || message.content === undefined) {
    message.content = '';
  }
  
  // 如果内容是数组，尝试提取文本
  if (Array.isArray(message.content)) {
    const textItems = message.content
      .filter((item: any) => item && item.type === 'text' && item.text)
      .map((item: any) => item.text);
    
    if (textItems.length > 0) {
      message.content = textItems.join(' ');
    } else {
      message.content = '';
    }
  }
  
  // 确保内容是字符串
  if (typeof message.content !== 'string') {
    message.content = String(message.content || '');
  }
  
  return {
    role: message.role,
    content: message.content
  };
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
    
    // 处理纯文本消息（直接使用DeepSeek处理）
    if (!media) {
      return await handleTextOnlyMessages(messages);
    } else {
      // 处理媒体消息（先用通义千问处理媒体，再用DeepSeek分析）
      return await handleMediaMessages(messages, media);
    }
  } catch (error: any) {
    console.error('[API Request Error]:', error);
    return NextResponse.json({ error: error.message || '处理请求失败' }, { status: 500 });
  }
}

// 处理纯文本消息
async function handleTextOnlyMessages(messages: any[]) {
  try {
    // 创建DeepSeek客户端
    const deepseek = createDeepSeekClient();
    
    // 获取模型名称 - 现在使用 deepseek-reasoner 作为对话模型
    const modelName = process.env.DEEPSEEK_REASONER_MODEL || "deepseek-reasoner";
    
    // 验证并格式化所有消息，确保上下文完整性
    const validatedMessages = messages.map(validateAndFormatMessage);
    
    // 处理系统消息
    const systemMessages = messages.filter(msg => msg.role === 'system');
    if (systemMessages.length > 0) {
      validatedMessages.unshift({
        role: 'system',
        content: [{ 
          type: 'text', 
          text: `你是一个多模态AI助手，擅长分析媒体内容。` 
        }]
      });
    } else {
      // 如果没有系统消息，添加一个默认的
      validatedMessages.unshift({
        role: 'system',
        content: [{ 
          type: 'text', 
          text: `你是一个多模态AI助手，擅长分析媒体内容。` 
        }]
      });
    }
    
    console.log('[DeepSeek] 发送文本请求，消息数量:', validatedMessages.length, '使用模型:', modelName);
    
    // 打印对话历史摘要，用于调试
    const conversationSummary = validatedMessages.map((msg, index) => ({
      index,
      role: msg.role,
      contentPreview: typeof msg.content === 'string' ? 
        (msg.content.length > 50 ? msg.content.substring(0, 50) + '...' : msg.content) : 
        '非文本内容'
    }));
    console.log('[DeepSeek] 对话历史摘要:', JSON.stringify(conversationSummary));
    
    // 创建聊天补全请求，使用 deepseek-reasoner 模型
    const completion = await deepseek.chat.completions.create({
      model: modelName,
      messages: validatedMessages,
      stream: true,
      temperature: 0.7,
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
    console.error('[DeepSeek API Error]:', error);
    return handleApiError(error);
  }
}

// 处理媒体消息
async function handleMediaMessages(messages: any[], media: any) {
  try {
    // 确定是否使用DeepSeek辅助分析
    const isDeepSeekEnabled = process.env.USE_DEEPSEEK_FOR_ANALYSIS === 'true';
    console.log('[媒体处理] DeepSeek辅助分析:', isDeepSeekEnabled ? '启用' : '禁用');
    
    // 处理媒体消息
    const mediaResult = await processMediaWithQwen(messages, media);
    
    // 如果返回的是流，且不需要DeepSeek辅助分析，直接返回流式响应
    if (mediaResult instanceof ReadableStream && !isDeepSeekEnabled) {
      return new NextResponse(mediaResult, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        }
      });
    }
    
    // 如果启用了DeepSeek辅助分析，则使用DeepSeek处理
    if (isDeepSeekEnabled && mediaResult instanceof ReadableStream) {
      // 由于我们需要先读取通义千问的完整响应，再传给DeepSeek
      // 这里我们需要将流转换为字符串
      const reader = mediaResult.getReader();
      let qwenResponse = '';
      
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const chunk = new TextDecoder().decode(value);
          // 解析SSE格式数据
          const lines = chunk.split('\n\n');
          for (const line of lines) {
            if (line.startsWith('data: ') && !line.includes('[DONE]')) {
              const data = line.replace('data: ', '');
              try {
                const parsed = JSON.parse(data);
                if (parsed.content) {
                  qwenResponse += parsed.content;
                }
              } catch (e) {
                // 忽略解析错误
              }
            }
          }
        }
        
        console.log('[媒体处理] 通义千问返回内容长度:', qwenResponse.length);
        
        // 使用DeepSeek Reasoner进行深入分析
        const deepseekStream = await processWithDeepSeekReasoner(messages, qwenResponse, media);
        
        // 返回DeepSeek的流式响应
        return new NextResponse(deepseekStream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
          }
        });
      } catch (error) {
        console.error('[媒体处理] 转换流式响应失败:', error);
        // 如果处理过程中出错，则返回错误信息
        return handleErrorAsStream(`媒体处理失败: ${error instanceof Error ? error.message : '未知错误'}`);
      }
    }
    
    // 如果不是流（是错误字符串），或者处理过程出错，使用SSE格式返回错误
    return handleErrorAsStream(typeof mediaResult === 'string' ? mediaResult : '媒体处理失败');
  } catch (error) {
    console.error('[媒体处理错误]:', error);
    return handleApiError(error);
  }
}

// 将错误信息包装为SSE流
function handleErrorAsStream(errorMessage: string) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      try {
        // 发送错误消息
        const errorChunk = encoder.encode(`data: ${JSON.stringify({
          id: 'error-' + Date.now(),
          model: 'error-handler',
          object: 'chat.completion.chunk',
          choices: [
            {
              index: 0,
              delta: { 
                role: 'assistant', 
                content: errorMessage
              },
              finish_reason: 'error'
            }
          ],
          created: Math.floor(Date.now() / 1000)
        })}\n\n`);
        
        controller.enqueue(errorChunk);
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      } catch (error) {
        console.error('[错误处理流创建失败]:', error);
        controller.close();
      }
    }
  });
  
  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  });
}

// 使用通义千问处理媒体
async function processMediaWithQwen(messages: any[], media: any): Promise<string | ReadableStream<any>> {
  // 创建通义千问客户端
  const qwen = createQwenClient();
  
  // 准备消息格式
  let formattedMessages: any[] = [];
  
  // 处理系统消息
  const systemMessages = messages.filter(msg => msg.role === 'system');
  if (systemMessages.length > 0) {
    formattedMessages.push({
      role: 'system',
      content: [{ 
        type: 'text', 
        text: `你是一个多模态AI助手，擅长分析媒体内容。` 
      }]
    });
  } else {
    // 如果没有系统消息，添加一个默认的
    formattedMessages.push({
      role: 'system',
      content: [{ 
        type: 'text', 
        text: `你是一个多模态AI助手，擅长分析媒体内容。` 
      }]
    });
  }
  
  // 添加历史用户和助手消息
  const nonSystemMessages = messages.filter(msg => msg.role !== 'system');
  const messageCount = nonSystemMessages.length;
  
  // 添加历史消息，但排除最后一条用户消息（将与媒体一起处理）
  for (let i = 0; i < messageCount - 1; i++) {
    const msg = nonSystemMessages[i];
    if (msg.role === 'user') {
      formattedMessages.push({
        role: 'user',
        content: [{ 
          type: 'text', 
          text: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
        }]
      });
    } else if (msg.role === 'assistant') {
      formattedMessages.push({
        role: 'assistant',
        content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
      });
    }
  }
  
  // 处理最后一条消息（包含媒体）
  const lastMessage = nonSystemMessages[messageCount - 1];
  let userContent: any[] = [];
  
  // 根据媒体类型添加不同的内容
  if (media.type === 'image') {
    // 修改图片格式处理
    const imageFormat = media.format?.toLowerCase() || 'png';
    
    try {
      console.log('[图片处理] 准备处理图片，格式:', imageFormat, '数据长度:', media.data.length);
      
      // 使用备份文件中的正确格式添加在数组开头
      userContent.unshift({
        type: 'image_url',
        image_url: { 
          url: `data:image/${imageFormat};base64,${media.data}` 
        }
      });
      
      // 添加用户原始文本内容（如果有）
      if (typeof lastMessage.content === 'string' && lastMessage.content.trim()) {
        userContent.push({ 
          type: 'text', 
          text: lastMessage.content
        });
      }
      
      // 添加分析提示
      userContent.push({ 
        type: 'text', 
        text: '请详细分析这张图片的内容，包括图片中的主体、场景、文字、特征等关键信息。如果有文字，请转录。' 
      });
      
      console.log('[图片处理] 图片消息处理完成');
    } catch (error) {
      console.error('[图片处理错误]:', error);
      userContent.push({ 
        type: 'text', 
        text: '由于图片处理失败，请尝试使用其他图片格式或更小的文件。' 
      });
    }
  } else if (media.type === 'audio') {
    // 修改音频格式处理
    const audioFormat = media.format?.toLowerCase() || 'mp3';
    
    try {
      console.log('[音频处理] 准备处理音频，格式:', audioFormat, '数据长度:', media.data.length);
      
      // 检查音频大小，如果太大则提示错误
      if (media.data.length > 100000) {
        console.warn('[音频处理警告] 音频数据过大，可能超过API限制。尝试使用更短的音频。');
        // 这里我们仍然尝试处理，但会给出警告
      }
      
      // 使用备份文件中的正确格式添加在数组开头
      userContent.unshift({
        type: 'input_audio',
        input_audio: { 
          data: `data:;base64,${media.data}`, 
          format: audioFormat 
        }
      });
      
      // 添加用户原始文本内容（如果有）
      if (typeof lastMessage.content === 'string' && lastMessage.content.trim()) {
        userContent.push({ 
          type: 'text', 
          text: lastMessage.content
        });
      }
      
      // 添加分析提示
      userContent.push({ 
        type: 'text', 
        text: '请认真听取这段音频并详细转录其内容。如果有背景声音或情绪变化，也请指出。' 
      });
      
      console.log('[音频处理] 音频消息处理完成');
    } catch (error) {
      console.error('[音频处理错误]:', error);
      userContent.push({ 
        type: 'text', 
        text: '由于音频处理失败，请尝试使用其他音频格式或更小的文件。' 
      });
    }
  } else if (media.type === 'video') {
    // 修改视频格式处理
    const videoFormat = media.format?.toLowerCase() || 'mp4';
    
    try {
      console.log('[视频处理] 准备处理视频，格式:', videoFormat, '数据长度:', media.data.length);
      
      // 使用备份文件中的正确格式添加在数组开头
      userContent.unshift({
        type: 'video_url',
        video_url: { 
          url: `data:;base64,${media.data}` 
        }
      });
      
      // 添加用户原始文本内容（如果有）
      if (typeof lastMessage.content === 'string' && lastMessage.content.trim()) {
        userContent.push({ 
          type: 'text', 
          text: lastMessage.content
        });
      }
      
      // 添加分析提示
      userContent.push({ 
        type: 'text', 
        text: '请详细描述这段视频的内容，包括场景、人物、动作和任何重要细节。如果有对话，请转录。' 
      });
      
      console.log('[视频处理] 视频消息处理完成');
    } catch (error) {
      console.error('[视频处理错误]:', error);
      userContent.push({ 
        type: 'text', 
        text: '由于视频处理失败，请尝试使用其他视频格式或更小的文件。' 
      });
    }
  }
  
  // 添加用户消息（包含媒体）
  formattedMessages.push({
    role: 'user',
    content: userContent
  });
  
  console.log('[Qwen API] 发送到通义千问的消息结构:', 
    formattedMessages.map(m => ({ 
      role: m.role, 
      contentTypes: Array.isArray(m.content) ? 
        m.content.map((c: any) => c.type) : typeof m.content 
    }))
  );
  
  // 非流式调用通义千问，获取完整的媒体分析结果
  try {
    console.log('[Qwen API] 准备发送请求到通义千问，消息数量:', formattedMessages.length);
    
    const chatCompletion = await qwen.chat.completions.create({
      model: "qwen-omni-turbo",  // 使用turbo模型
      messages: formattedMessages,
      stream: true,
      stream_options: {
        include_usage: true
      }
    });
    
    // 创建返回的流对象
    const responseStream = await createStream(chatCompletion);
    
    // 返回流式响应
    return responseStream;
  } catch (error: any) {
    console.error('[Media Processing Error]:', error);
    console.error('[API Error Details]:', JSON.stringify(error, null, 2));
    
    // 构建友好的错误提示
    let errorMessage = '媒体处理失败。';
    
    if (error.status === 500) {
      errorMessage += '服务器内部错误，请稍后再试或尝试使用不同的媒体格式/大小。';
    } else if (error.status === 413 || error.message?.includes('too large')) {
      errorMessage += '媒体文件太大，请使用更小的文件。';
    } else if (error.status === 415 || error.message?.includes('format')) {
      errorMessage += '不支持的媒体格式，请尝试使用常见格式如MP3、MP4或PNG。';
    } else if (error.status === 400 && error.message?.includes('does not appear to be valid')) {
      errorMessage += '媒体URL格式无效，请检查数据格式是否正确。';
    } else if (error.status === 400 && error.message?.includes('content field is a required field')) {
      errorMessage += '消息格式错误，请确保正确提供了内容字段。';
    }
    
    // 返回错误提示作为分析结果
    return errorMessage;
  }
}

// 使用DeepSeek Reasoner处理媒体分析结果
async function processWithDeepSeekReasoner(messages: any[], qwenResponse: string, media: any): Promise<ReadableStream<any>> {
  // 创建DeepSeek客户端
  const deepseek = createDeepSeekClient();
  
  // 提取系统消息
  const systemMessages = messages.filter(msg => msg.role === 'system');
  
  // 筛选历史消息，保留所有非系统消息的对话历史
  // 注意：这里不再排除用户消息，而是保留完整对话历史
  const historyMessages = messages.filter(msg => msg.role !== 'system');
  
  // 获取最后一条用户消息的文本内容
  let lastUserMessage: any = null;
  for (let i = historyMessages.length - 1; i >= 0; i--) {
    if (historyMessages[i].role === 'user') {
      lastUserMessage = historyMessages[i];
      break;
    }
  }
  const userContent = lastUserMessage ? lastUserMessage.content : '请分析这个媒体内容';
  
  // 确保mediaType始终有值
  const mediaType = media && media.type ? media.type : 'unknown';
  
  // 构建上下文增强型系统提示，支持思考过程
  const enhancedSystemMessage = {
    role: 'system',
    content: `你是一个强大的多模态助手，能够分析各种内容并提供深入见解。

当处理媒体内容时，你会收到两部分信息：
1. 用户的原始问题或指令
2. 通义千问AI对媒体内容的初步分析

你的任务是：
- 先在reasoning_content中展示你的思考过程，分析媒体内容的关键点
- 然后在普通回复中提供简洁、有见解的回答
- 确保你的回答既考虑到媒体内容的细节，也与用户的原始问题相关`
  };
  
  // 构建新的消息数组，保留完整对话历史
  const deepseekMessages = [
    // 使用增强的系统消息，如果原来有系统消息则使用原系统消息
    ...(systemMessages.length > 0 ? systemMessages : [enhancedSystemMessage]),
    
    // 添加历史消息（除了最后一条用户消息）
    ...historyMessages.slice(0, -1),
    
    // 添加带有通义千问分析结果的用户消息
    {
      role: 'user',
      content: `我需要你分析以下${mediaType}内容：

用户原始问题：${typeof userContent === 'string' ? userContent : JSON.stringify(userContent)}

通义千问的初步分析结果：
${qwenResponse}

请首先在reasoning_content中详细思考，然后提供简洁有用的回答。`
    }
  ];
  
  // 打印对话历史摘要（仅用于调试）
  const conversationSummary = deepseekMessages.map((msg, index) => ({
    index,
    role: msg.role,
    contentPreview: typeof msg.content === 'string' 
      ? msg.content.substring(0, 50) + (msg.content.length > 50 ? '...' : '')
      : '非文本内容'
  }));
  console.log('[DeepSeek Reasoner] 对话历史摘要:', JSON.stringify(conversationSummary));
  console.log('[DeepSeek Reasoner] 发送推理请求，消息数量:', deepseekMessages.length, '使用模型:', process.env.DEEPSEEK_REASONER_MODEL || "deepseek-reasoner");
  
  try {
    // 创建流式聊天补全请求
    const completion = await deepseek.chat.completions.create({
      model: process.env.DEEPSEEK_REASONER_MODEL || "deepseek-reasoner",
      messages: deepseekMessages,
      stream: true,
      temperature: 0.7,
      max_tokens: 1500
    });
    
    // 创建流式响应
    return await createStream(completion);
  } catch (error: any) {
    console.error('[DeepSeek API Error]:', error);
    // 在错误情况下创建一个包含错误信息的流
    const encoder = new TextEncoder();
    const errorStream = new ReadableStream({
      start(controller) {
        const errorMessage = `分析过程中出现错误: ${error.message || '未知错误'}`;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
          content: errorMessage,
          error: true
        })}\n\n`));
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      }
    });
    return errorStream;
  }
}

// 处理API错误
function handleApiError(error: any) {
  console.error('[DeepSeek API Error]:', error);
  
  // 打印更详细的错误信息
  try {
    console.error('[API Error Details]:', JSON.stringify(error, null, 2));
  } catch (e) {
    console.error('[API Error Details 序列化失败]:', e);
  }
  
  // 针对不同类型的错误返回不同的错误信息
  if (error.status === 401) {
    return NextResponse.json(
      { error: '身份验证失败，请检查API密钥是否正确，或联系DeepSeek客服确认您的账户状态' },
      { status: 401 }
    );
  } else if (error.status === 400) {
    return NextResponse.json(
      { error: '请求参数错误，可能是模型名称不正确或参数格式有误' },
      { status: 400 }
    );
  } else if (error.status === 404) {
    return NextResponse.json(
      { error: '请求的资源不存在，可能是模型名称错误或API端点变更' },
      { status: 404 }
    );
  } else if (error.status === 429) {
    return NextResponse.json(
      { error: '请求过于频繁，请稍后再试' },
      { status: 429 }
    );
  }
  
  // 默认错误处理
  return NextResponse.json(
    { error: error.message || '处理请求失败，请联系管理员' },
    { status: error.status || 500 }
  );
}

// 标题生成保持使用 deepseek-chat 模型
async function generateTitle(messages: any[]) {
  try {
    // 创建DeepSeek客户端
    const deepseek = createDeepSeekClient();
    
    // 获取模型名称 - 标题生成使用 deepseek-chat
    const modelName = process.env.DEEPSEEK_CHAT_MODEL || "deepseek-chat";
    
    // 提取对话内容
    const conversationContent = messages.map(m => `${m.role}: ${m.content}`).join('\n');
    
    // 构建标题生成请求，使用正确的 OpenAI API 消息格式
    const titleRequest = [
      {
        role: 'system' as const,  // 使用as const确保类型正确
        content: '你是一个擅长总结和提取主题的助手。你的任务是为对话生成一个简短的中文标题。'
      },
      {
        role: 'user' as const,    // 使用as const确保类型正确
        content: `基于以下对话内容，生成一个简短的中文标题（不超过10个字）：\n${conversationContent}`
      }
    ];
    
    // 发送请求
    const completion = await deepseek.chat.completions.create({
      model: modelName,
      messages: titleRequest,
      stream: false,
      temperature: 0.5,
      max_tokens: 50
    });
    
    return completion.choices[0].message.content;
  } catch (error) {
    console.error('[标题生成错误]:', error);
    return '新对话'; // 默认标题
  }
} 