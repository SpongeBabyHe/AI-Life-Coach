/**
 * API 服务封装
 * 封装 API 调用细节（URL、FormData 构建、headers）
 */

import axios from 'axios';

// API 基础地址（从环境变量读取，如果没有则使用默认值）
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001';

/**
 * 统一内容分析接口
 * 支持文本、图片、语音的任意组合输入
 */
export const analyzeContent = async ({ text, imageFiles, audioFiles }) => {
  const formData = new FormData();

  // 添加文本（如果有）
  if (text && text.trim()) {
    formData.append('text', text.trim());
  }

  // 添加图片文件（如果有）
  if (imageFiles) {
    const files = Array.isArray(imageFiles) ? imageFiles : [imageFiles];
    files.forEach(file => {
      if (file) {
        formData.append('image', file); // 字段名必须是 'image'
      }
    });
  }

  // 添加音频文件（如果有）
  if (audioFiles) {
    const files = Array.isArray(audioFiles) ? audioFiles : [audioFiles];
    files.forEach(file => {
      if (file) {
        formData.append('audio', file); // 字段名必须是 'audio'
      }
    });
  }

  return axios.post(`${API_BASE_URL}/api/analyze`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
};