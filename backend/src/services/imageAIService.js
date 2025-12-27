/**
 * 图片AI服务
 * 
 * 职责：
 * 1. 使用支持图片的模型（gpt-4o-mini）进行 OCR（从图片中提取文字）
 * 2. 生成图片的文本描述/摘要
 * 
 * 返回格式：
 * { ocr_text: string, summary: string }
 */

const axios = require('axios');
const dotenv = require('dotenv');
const fs = require('fs').promises;
dotenv.config();

class ImageAIService {
  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY;
    this.apiUrl = process.env.OPENAI_API_URL;
    this.model = process.env.OPENAI_MODEL_IMAGE_TEXT;

    if (!this.apiKey) {
      throw new Error('OPENAI_API_KEY 环境变量未设置');
    }

    // axios 实例：集中超时/headers 配置
    this.client = axios.create({
      baseURL: this.apiUrl,
      timeout: 30_000 // 30s 超时，图片处理可能需要更长时间
    });
  }

  /**
   * 分析图片，提取OCR文本和生成摘要
   * @param {Object} imageFile - Multer文件对象 { path, originalname, mimetype }
   * @param {string} cosUrl - 图片的COS URL（可选，如果提供则使用URL，否则使用本地文件）
   * @returns {Promise<Object>} { ocr_text: string, summary: string }
   */
  async analyzeImage(imageFile, cosUrl = null) {
    try {
      // 准备图片数据
      let imageUrl;
      if (cosUrl) {
        // 如果提供了COS URL，使用URL方式
        imageUrl = cosUrl;
      } else {
        // 否则读取本地文件并转换为base64
        const imageBuffer = await fs.readFile(imageFile.path);
        const base64Image = imageBuffer.toString('base64');
        imageUrl = `data:${imageFile.mimetype};base64,${base64Image}`;
      }

      // 构建提示词
      const prompt = `请分析这张图片并完成以下任务：
1. OCR（光学字符识别）：提取图片中的所有文字内容。如果图片中没有文字，返回空字符串。
2. 生成摘要：用简洁的文字描述图片的主要内容、场景或关键信息。

请以JSON格式返回，格式如下：
{
  "ocr_text": "提取的文字内容",
  "summary": "图片摘要描述"
}

只返回JSON，不要包含任何其他文字或markdown格式。`;

      // 构建消息
      const messages = [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: prompt
            },
            {
              type: 'image_url',
              image_url: {
                url: imageUrl
              }
            }
          ]
        }
      ];

      // 调用 OpenAI API
      const response = await this.client.post(
        '/v1/chat/completions',
        {
          model: this.model,
          messages: messages,
          max_tokens: 1000,
          temperature: 0.3
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`
          }
        }
      );

      // 解析响应
      const content = response.data?.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error('OpenAI API 返回内容为空');
      }

      // 尝试解析JSON（可能包含markdown代码块）
      let result;
      try {
        // 尝试直接解析
        result = JSON.parse(content);
      } catch (e) {
        // 如果失败，尝试提取代码块中的JSON
        const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
        if (jsonMatch) {
          result = JSON.parse(jsonMatch[1]);
        } else {
          // 如果都没有，尝试提取第一个JSON对象
          const jsonObjectMatch = content.match(/\{[\s\S]*\}/);
          if (jsonObjectMatch) {
            result = JSON.parse(jsonObjectMatch[0]);
          } else {
            throw new Error('无法从响应中解析JSON');
          }
        }
      }

      // 返回标准格式
      return {
        ocr_text: result.ocr_text || result.ocrText || null,
        summary: result.summary || null
      };

    } catch (error) {
      console.error('图片AI分析失败:', error.message);
      // 返回错误信息，但不抛出异常（让调用者决定如何处理）
      return {
        ocr_text: null,
        summary: null,
        error: error.message
      };
    }
  }
}

module.exports = new ImageAIService();
