/**
 * AI 服务封装
 *
 * 职责：
 * 1) 构造高质量的 Prompt（提示工程）
 * 2) 调用大模型 API 并做超时/错误处理
 * 3) 解析和校验返回的 JSON 结构，输出统一的业务对象
 *
 * 约定（对齐数据库 schema：entries / entry_attachments）：
 * - entries 主要字段：type(todo|idea|mood), title, content, summary, time, date,
 *   location, status, completed, reminders[], emotion_type, intensity, tags[], keywords[]
 * - attachments 相关：transcribed_text, ocr_text（供上层保存到 entry_attachments）
 * - 当前实现：仅处理纯文本输入；
 */

const axios = require('axios');
const dotenv = require('dotenv');
dotenv.config();

class AIService {
  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY;
    this.apiUrl = process.env.OPENAI_API_URL;
    this.model = process.env.OPENAI_MODEL_IMAGE_TEXT;

    // 验证必需的配置
    if (!this.apiUrl) {
      throw new Error('OPENAI_API_URL 环境变量未设置');
    }

    // axios 实例：集中超时/headers 配置
    this.client = axios.create({
      baseURL: this.apiUrl,
      timeout: 15_000 // 15s 超时，避免请求悬挂
    });
  }

  /**
   * 分析内容并返回结构化结果（纯文本）
   * @param {Object} inputData - { text }
   * @returns {Promise<Object>} 业务结构化结果
   */
  async analyzeContent(inputData = {}) {
    // 验证输入参数
    if (!inputData || typeof inputData !== 'object') {
      throw new Error('analyzeContent 需要传入有效的对象参数');
    }

    const text = (inputData.text || '').trim(); // 去掉两端的空白字符，减少模型误判

    // 验证 API Key
    if (!this.apiKey) {
      throw new Error('OPENAI_API_KEY 环境变量未设置');
    }

    const prompt = this.createPrompt(text);
    const messages = this.createMessages(prompt);

    // 调用大模型
    const aiResponse = await this.client.post(
      '/v1/chat/completions',
      {
        model: this.model,
        messages,
        temperature: 0.3,
        max_tokens: 400
      },
      {
        headers: { Authorization: `Bearer ${this.apiKey}` }
      }
    );

    // 解析与校验
    return this.normalizeResponse(aiResponse.data);
  }

  /**
   * 构造提示词，强调“仅输出 JSON”与字段约束，字段名称与数据库对齐
   */
  createPrompt(content) {
    return `
请分析用户内容并返回严格的 JSON，不要包含任何额外文字或注释。

用户输入（可为空）:
<<<USER_INPUT>>>
${content || '（无文本输入）'}
<<<END_USER_INPUT>>>

要求：
- 仅输出 JSON；所有字段必须存在，未知请用 null 或空数组。
- 枚举约束：type=todo|idea|mood；status=pending|completed|null。
- 格式：time=HH:mm（24h），date=YYYY-MM-DD。
- 长度限制：title<=80 字，summary<=120 字，keywords/tags 最多 5 个。
- 不要编造内容；若无法识别，请在 summary 说明原因，并选择最接近的 type。

返回 JSON 结构（注意键名和类型）：
{
  "type": "todo|idea|mood",
  "title": "<string|null>",
  "content": "<string|null>",
  "summary": "<string|null>",
  "keywords": ["<string>", ...],
  "tags": ["<string>", ...],
  "time": "<HH:mm|null>",
  "date": "<YYYY-MM-DD|null>",
  "location": "<string|null>",
  "reminders": ["<string>", ...],
  "status": "pending|completed|null",
  "completed": true|false|null,
  "emotion_type": "<string|null>",
  "intensity": <1-10|null>,
  "transcribed_text": "<string|null>",
  "ocr_text": "<string|null>"
}
`.trim();
  }

  // 组装 messages（纯文本）
  createMessages(prompt) {
    const messages = [
      {
        role: 'system',
        content: 'You are a concise assistant that only returns valid JSON.'
      },
      {
        role: 'user',
        content: prompt
      }
    ];

    return messages;
  }

  /**
   * 解析并校验模型响应，输出统一业务对象
   * @param {Object} response - 来自 /v1/chat/completions 的响应
   */
  normalizeResponse(response) {
    // 兼容 OpenAI 格式：choices[0].message.content
    const rawContent = response?.choices?.[0]?.message?.content;
    if (!rawContent) {
      throw new Error('AI 返回内容为空');
    }

    let json;
    try {
      json = JSON.parse(rawContent);
    } catch (e) {
      const err = new Error('AI 返回非 JSON，可见 rawContent');
      err.statusCode = 500;
      err.raw = rawContent;
      throw err;
    }

    const type = this.normalizeEnum(json.type, ['todo', 'idea', 'mood'], null);

    const safe = {
      type,
      title: this.normalizeString(json.title),
      content: this.normalizeString(json.content),
      summary: this.normalizeString(json.summary),
      keywords: this.normalizeStringArray(json.keywords),
      tags: this.normalizeStringArray(json.tags),
      time: this.normalizeString(json.time),
      date: this.normalizeString(json.date),
      location: this.normalizeString(json.location),
      reminders: this.normalizeStringArray(json.reminders),
      status: this.normalizeEnum(json.status, ['pending', 'completed'], null),
      completed: this.normalizeBool(json.completed),
      emotion_type: this.normalizeString(json.emotion_type),
      intensity: this.normalizeNumber(json.intensity),
      transcribed_text: this.normalizeString(json.transcribed_text),
      ocr_text: this.normalizeString(json.ocr_text)
    };

    return safe;
  }

  // ========== 辅助校验方法 ==========
  normalizeString(value) {
    return typeof value === 'string' ? value : null;
  }

  normalizeStringArray(value) {
    if (!Array.isArray(value)) return [];
    return value
      .filter((v) => typeof v === 'string' && v.trim())
      .map((v) => v.trim())
      .slice(0, 5);
  }

  normalizeEnum(value, allowed, fallback = null) {
    if (typeof value === 'string' && allowed.includes(value)) return value;
    return fallback;
  }

  normalizeBool(value) {
    return typeof value === 'boolean' ? value : null;
  }

  normalizeNumber(value) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
    return null;
  }

}

module.exports = new AIService();