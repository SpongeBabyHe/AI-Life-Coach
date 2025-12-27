/**
 * 语音AI服务
 * 
 * 职责：
 * 1. 使用 OpenAI 音频转录 API 进行 ASR（自动语音识别，将语音转文字）
 * 2. 返回转写的文本内容
 * 
 * 返回格式：
 * { transcribed_text: string }
 */

const axios = require('axios');
const dotenv = require('dotenv');
const fs = require('fs');
const FormData = require('form-data');
dotenv.config();

class AudioAIService {
  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY;
    this.apiUrl = process.env.OPENAI_API_URL;
    this.audioModel = process.env.OPENAI_MODEL_AUDIO;

    if (!this.apiKey) {
      throw new Error('OPENAI_API_KEY 环境变量未设置');
    }

    if (!this.audioModel) {
      throw new Error('OPENAI_MODEL_AUDIO 环境变量未设置');
    }

    // axios 实例：集中超时/headers 配置
    // 音频转录 API 可能需要更长时间处理音频文件
    this.client = axios.create({
      baseURL: this.apiUrl,
      timeout: 60_000 // 60s 超时，音频处理可能需要更长时间
    });
  }

  /**
   * 转写音频文件为文字（ASR）
   * @param {Object} audioFile - Multer文件对象 { path, originalname, mimetype }
   * @param {string} cosUrl - 音频的COS URL（可选，如果提供则使用URL，否则使用本地文件）
   * @returns {Promise<Object>} { transcribed_text: string }
   */
  async transcribeAudio(audioFile, cosUrl = null) {
    try {
      // 验证音频类型
      if (!audioFile.mimetype.startsWith('audio/')) {
        throw new Error(`文件 ${audioFile.originalname} 不是音频格式`);
      }

      let audioFileStream;
      let audioFileName = audioFile.originalname;

      if (cosUrl) {
        // 如果提供了COS URL，需要先下载文件
        // TODO: 实现从COS下载文件的逻辑
        // 目前先使用本地文件
        audioFileStream = fs.createReadStream(audioFile.path);
      } else {
        // 使用本地文件
        audioFileStream = fs.createReadStream(audioFile.path);
      }

      // 创建 FormData（音频转录 API 需要 multipart/form-data 格式）
      const formData = new FormData();
      formData.append('file', audioFileStream, {
        filename: audioFileName,
        contentType: audioFile.mimetype
      });

      // 设置模型（从环境变量读取）
      formData.append('model', this.audioModel);
      formData.append('response_format', 'json'); // 返回 JSON 格式

      // 调用 OpenAI 音频转录 API
      const response = await this.client.post(
        '/v1/audio/transcriptions',
        formData,
        {
          headers: {
            ...formData.getHeaders(),
            'Authorization': `Bearer ${this.apiKey}`
          },
          maxContentLength: Infinity,
          maxBodyLength: Infinity
        }
      );

      // 解析响应
      // 音频转录 API 返回格式：{ text: "转写的文字内容" }
      const transcribedText = response.data?.text;

      if (!transcribedText) {
        throw new Error('音频转录 API 返回内容为空');
      }

      // 返回标准格式
      return {
        transcribed_text: transcribedText
      };

    } catch (error) {
      console.error('语音转文字失败:', error.message);

      // 如果是 axios 错误，提取更详细的错误信息
      let errorMessage = error.message;
      if (error.response) {
        errorMessage = error.response.data?.error?.message || error.message;
        console.error('OpenAI API 错误详情:', error.response.data);
      }

      // 返回错误信息，但不抛出异常（让调用者决定如何处理）
      return {
        transcribed_text: null,
        error: errorMessage
      };
    }
  }
}

module.exports = new AudioAIService();
