/**
 * 文本朗读工具函数
 */

// 当前播放实例
let currentUtterance: SpeechSynthesisUtterance | null = null;
let isPlaying = false;

/**
 * 播放文本朗读
 * @param text 要朗读的文本
 * @param options 朗读选项
 * @returns 是否成功开始播放
 */
export const speak = (
  text: string,
  options: {
    rate?: number;       // 语速 (0.1-10)
    pitch?: number;      // 音调 (0-2)
    volume?: number;     // 音量 (0-1)
    voiceURI?: string;   // 使用的声音名称
    lang?: string;       // 语言 (默认为 'zh-CN')
    onStart?: () => void;  // 开始朗读时的回调
    onEnd?: () => void;    // 结束朗读时的回调
    onError?: (err: any) => void; // 出错时的回调
  } = {}
): boolean => {
  // 检查浏览器是否支持语音合成
  if (!window.speechSynthesis) {
    console.error('您的浏览器不支持语音合成');
    options.onError?.('浏览器不支持语音合成');
    return false;
  }

  // 如果当前有朗读在进行，先停止它
  stop();

  try {
    // 创建语音合成实例
    const utterance = new SpeechSynthesisUtterance(text);
    
    // 设置默认值和用户指定的选项
    utterance.rate = options.rate || 1;
    utterance.pitch = options.pitch || 1;
    utterance.volume = options.volume || 1;
    utterance.lang = options.lang || 'zh-CN';
    
    // 如果指定了声音，尝试使用它
    if (options.voiceURI) {
      const voices = window.speechSynthesis.getVoices();
      const selectedVoice = voices.find(voice => voice.voiceURI === options.voiceURI);
      if (selectedVoice) {
        utterance.voice = selectedVoice;
      }
    }
    
    // 设置事件回调
    utterance.onstart = () => {
      isPlaying = true;
      options.onStart?.();
    };
    
    utterance.onend = () => {
      isPlaying = false;
      currentUtterance = null;
      options.onEnd?.();
    };
    
    utterance.onerror = (event) => {
      isPlaying = false;
      currentUtterance = null;
      options.onError?.(event);
    };
    
    // 保存当前朗读实例以便能停止它
    currentUtterance = utterance;
    
    // 开始朗读
    window.speechSynthesis.speak(utterance);
    return true;
  } catch (error) {
    console.error('文本朗读失败:', error);
    options.onError?.(error);
    return false;
  }
};

/**
 * 停止当前朗读
 */
export const stop = (): void => {
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
    isPlaying = false;
    currentUtterance = null;
  }
};

/**
 * 暂停当前朗读
 */
export const pause = (): void => {
  if (window.speechSynthesis && isPlaying) {
    window.speechSynthesis.pause();
    isPlaying = false;
  }
};

/**
 * 恢复暂停的朗读
 */
export const resume = (): void => {
  if (window.speechSynthesis && !isPlaying && currentUtterance) {
    window.speechSynthesis.resume();
    isPlaying = true;
  }
};

/**
 * 检查当前是否有朗读正在进行
 * @returns 是否正在朗读
 */
export const isReading = (): boolean => {
  return isPlaying;
};

/**
 * 获取可用的语音列表
 * @returns 可用语音列表
 */
export const getVoices = (): SpeechSynthesisVoice[] => {
  return window.speechSynthesis?.getVoices() || [];
}; 