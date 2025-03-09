这是一个基于Next.js和通义千问全模态大模型的聊天应用，支持图片、音频和视频的处理。#已添加deepseek以增强文本能力

### ！！！
### 尚处于早期开发阶段，会出现很多奇奇怪怪的事情。


## 功能特点

- 支持文本消息
- 支持图片识别和分析
- 支持音频识别和分析
- 支持视频识别和分析
- 实时流式响应
- 历史会话管理

## 系统要求

- **Node.js**: 推荐 v18.x 或更高版本
- **浏览器**: 最新版的 Chrome、Firefox、Safari 或 Edge (支持MediaRecorder API)
- **摄像头和麦克风**: 用于视频录制功能
- **API密钥**: 通义千问API密钥，deepseek-api密钥。

## 快速开始

### 安装依赖

```bash
npm install
```

### 配置环境变量


1. 创建`.env.local`进行以下设置

```
DEEPSEEK_CHAT_MODEL=deepseek-chat   #用作标题总结
DEEPSEEK_REASONER_MODEL=deepseek-reasoner   #弥补Qwen语言方面的不足
DEEPSEEK_API_KEY=您的API密钥
DASHSCOPE_API_KEY=您的API密钥
USE_DEEPSEEK_FOR_ANALYSIS=true  #使用deepseek-r1处理Qwen返回的多媒体内容解读

```

### 启动开发服务器

```bash
npm run dev
```

访问 [http://localhost:3000](http://localhost:3000) 开始使用应用。

## 视频录制功能说明

在使用视频录制功能时，请注意以下几点：

1. **视频限制**:
   - 建议录制长度保持在 5-15 秒
   - 最大录制时长为 30 秒
   - 视频分辨率为 480x360
   - 帧率限制在 15-20fps

2. **浏览器兼容性**:
   - 视频录制使用浏览器的 MediaRecorder API
   - 不同浏览器录制的格式可能略有不同
   - 推荐使用最新版Chrome获得最佳体验

3. **常见问题**:
   - 如果视频上传失败，请尝试录制更短的视频或降低环境光线
   - 首次使用时需要授予摄像头和麦克风权限
   - 某些企业网络可能会阻止摄像头访问


## API使用方法

本应用提供了统一的全模态API接口，可以处理文本、图片、音频和视频。

### API端点

```
POST /api/chat
```

### 请求格式

```javascript
{
  "messages": [
    {
      "role": "system",
      "content": "You are a helpful assistant."
    },
    {
      "role": "user",
      "content": "你好，请分析一下这张图片"
    }
  ],
  "media": {
    "type": "image", // 可选值: "image", "audio", "video"
    "data": "base64编码的媒体数据",
    "format": "png" // 格式，如png, jpg, mp3, mp4等
  }
}
```

### 响应格式

服务器发送事件(SSE)流，每个事件包含:

```
data: {"content": "模型生成的文本片段"}
```

最后一个事件:

```
data: [DONE]
```

## 工具函数

本应用提供了多个实用工具函数，方便在前端处理多模态内容:

- `sendMultiModalMessage`: 发送多模态消息并处理流式响应
- `fileToBase64`: 将文件转换为Base64编码
- `getFileType`: 获取文件类型（图片/音频/视频）
- `getFileFormat`: 获取文件格式后缀

## 技术栈

- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS
- OpenAI API兼容格式
- 通义千问全模态模型
