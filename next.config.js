/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 支持运行时环境变量
  env: {
    // 不再从process.env直接获取，确保使用.env.local中的值
    // DASHSCOPE_API_KEY: process.env.DASHSCOPE_API_KEY,
    // DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY
  },
  // 临时禁用ESLint检查
  eslint: {
    ignoreDuringBuilds: true,
  },
  // 确保流式响应能够正常工作
  serverExternalPackages: ['stream/web'],
};

module.exports = nextConfig; 