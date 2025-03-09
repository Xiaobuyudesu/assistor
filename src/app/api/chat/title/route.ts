import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

// 创建DeepSeek客户端（仅用于标题生成）
const createDeepSeekClient = () => {
  // 使用硬编码API密钥
  const apiKey = 'sk-7ef61fe9a9ce46439ceb4a2de0fddfa9';
  
  if (!apiKey) {
    console.error('[标题生成] 错误: DeepSeek API密钥未设置');
    throw new Error('DeepSeek API密钥未设置');
  }
  
  return new OpenAI({
    apiKey: apiKey,
    baseURL: "https://api.deepseek.com",
    timeout: 30000
  });
};

// 处理POST请求
export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json();
    
    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ title: '新对话' }, { status: 200 });
    }
    
    // 创建DeepSeek客户端
    const deepseek = createDeepSeekClient();
    
    // 使用deepseek-chat模型生成标题
    const modelName = process.env.DEEPSEEK_CHAT_MODEL || "deepseek-chat";
    
    // 提取对话内容
    const conversationContent = messages.map(m => `${m.role}: ${m.content}`).join('\n');
    
    // 构建标题生成请求
    const titleRequest = [
      {
        role: 'system' as const,
        content: '你是一个擅长总结和提取主题的助手。你的任务是为对话生成一个简短的中文标题。'
      },
      {
        role: 'user' as const,
        content: `基于以下对话内容，生成一个简短的中文标题（不超过10个字）：\n${conversationContent}`
      }
    ];
    
    console.log('[标题生成] 发送请求，消息数量:', titleRequest.length);
    
    // 发送请求
    const completion = await deepseek.chat.completions.create({
      model: modelName,
      messages: titleRequest,
      stream: false,
      temperature: 0.5,
      max_tokens: 50
    });
    
    const title = completion.choices[0].message.content?.trim() || '新对话';
    
    console.log('[标题生成] 生成标题:', title);
    
    return NextResponse.json({ title }, { status: 200 });
  } catch (error) {
    console.error('[标题生成] 错误:', error);
    return NextResponse.json(
      { error: '生成标题失败', title: '新对话' },
      { status: 500 }
    );
  }
} 