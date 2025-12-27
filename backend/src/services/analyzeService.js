/**
 * 内容分析服务
 * 
 * 职责：
 * 1. 处理图片文件（上传COS + OCR/图片AI分析）
 * 2. 处理语音文件（上传COS + ASR转文字）
 * 3. 综合分析所有输入（文本 + OCR结果 + 转文字结果）
 * 4. 保存分析结果和所有附件到数据库（使用事务）
 * 
 * 注意：此服务层包含业务逻辑，路由层只负责请求/响应协调
 */

const fs = require('fs').promises;
const aiService = require('./aiService');
const dbService = require('./dbService');
const storageService = require('./storageService');
const imageAIService = require('./imageAIService');
const audioAIService = require('./audioAIService');

class AnalyzeService {
  /**
   * 处理单个图片文件
   * @param {Object} imageFile - Multer文件对象
   * @returns {Promise<Object>} { text: string, attachment: Object, filePath: string }
   */
  async processImageFile(imageFile) {
    const filePath = imageFile.path;

    try {
      // 验证是图片类型
      if (!imageFile.mimetype.startsWith('image/')) {
        throw new Error(`文件 ${imageFile.originalname} 不是图片格式`);
      }

      // 上传到COS
      let cosUrl = null;
      try {
        // 使用文件路径和 buffer 两种方式，优先使用 Stream（文件路径）
        const fileBuffer = await fs.readFile(imageFile.path);
        const fileData = {
          buffer: fileBuffer,
          path: imageFile.path, // 添加文件路径，优先使用 Stream 方式
          originalname: imageFile.originalname,
          mimetype: imageFile.mimetype
        };

        const uploadResult = await storageService.uploadToCOS(fileData);
        cosUrl = uploadResult.url;
      } catch (cosError) {
        console.warn('COS上传失败:', cosError.message);
        // 继续处理，不中断流程
      }

      // 调用图片AI服务（OCR + 分析）
      const imageResult = await imageAIService.analyzeImage(imageFile, cosUrl);

      // 如果返回错误，记录但不中断流程
      if (imageResult.error) {
        console.warn(`图片处理失败 ${imageFile.originalname}:`, imageResult.error);
      }

      // 提取文本（用于综合分析）
      const extractedText = imageResult.ocr_text || imageResult.summary || null;

      // 准备附件信息
      const attachment = {
        file: imageFile,
        cosUrl: cosUrl,
        ocr_text: imageResult.ocr_text || null,
        processed: !!imageResult.ocr_text
      };

      return {
        text: extractedText,
        attachment: attachment,
        filePath: filePath
      };

    } catch (error) {
      // 返回错误信息，但不抛出异常（让调用者决定如何处理）
      return {
        text: null,
        attachment: null,
        filePath: filePath,
        error: error.message
      };
    }
  }

  /**
   * 处理单个语音文件
   * @param {Object} audioFile - Multer文件对象
   * @returns {Promise<Object>} { text: string, attachment: Object, filePath: string }
   */
  async processAudioFile(audioFile) {
    const filePath = audioFile.path;

    try {
      // 验证是音频类型
      if (!audioFile.mimetype.startsWith('audio/')) {
        throw new Error(`文件 ${audioFile.originalname} 不是音频格式`);
      }

      // 上传到COS
      let cosUrl = null;
      try {
        const fileBuffer = await fs.readFile(audioFile.path);
        const fileData = {
          buffer: fileBuffer,
          path: audioFile.path, // 添加文件路径，优先使用 Stream 方式
          originalname: audioFile.originalname,
          mimetype: audioFile.mimetype
        };

        const uploadResult = await storageService.uploadToCOS(fileData);
        cosUrl = uploadResult.url;
      } catch (cosError) {
        console.warn('COS上传失败:', cosError.message);
        // 继续处理，不中断流程
      }

      // 调用语音AI服务（ASR转文字）
      const audioResult = await audioAIService.transcribeAudio(audioFile, cosUrl);

      // 如果返回错误，记录但不中断流程
      if (audioResult.error) {
        console.warn(`音频处理失败 ${audioFile.originalname}:`, audioResult.error);
      }

      const transcribedText = audioResult.transcribed_text || null;

      // 准备附件信息
      const attachment = {
        file: audioFile,
        cosUrl: cosUrl,
        transcribed_text: transcribedText || null,
        processed: !!transcribedText
      };

      return {
        text: transcribedText,
        attachment: attachment,
        filePath: filePath
      };

    } catch (error) {
      // 返回错误信息，但不抛出异常
      return {
        text: null,
        attachment: null,
        filePath: filePath,
        error: error.message
      };
    }
  }

  /**
   * 处理所有图片文件（并行处理）
   * @param {Array} imageFiles - 图片文件数组
   * @returns {Promise<Object>} { texts: Array, attachments: Array, failedFiles: Array }
   */
  async processImages(imageFiles) {
    if (!imageFiles || imageFiles.length === 0) {
      return { texts: [], attachments: [], failedFiles: [] };
    }

    // 并行处理所有图片
    const results = await Promise.allSettled(
      imageFiles.map(file => this.processImageFile(file))
    );

    const texts = [];
    const attachments = [];
    const failedFiles = [];

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        const data = result.value;
        if (data.error) {
          failedFiles.push({
            filename: imageFiles[index].originalname,
            error: data.error
          });
        } else {
          if (data.text) {
            texts.push(data.text);
          }
          if (data.attachment) {
            attachments.push(data.attachment);
          }
        }
      } else {
        failedFiles.push({
          filename: imageFiles[index].originalname,
          error: result.reason?.message || '处理失败'
        });
      }
    });

    return { texts, attachments, failedFiles };
  }

  /**
   * 处理所有语音文件（并行处理）
   * @param {Array} audioFiles - 语音文件数组
   * @returns {Promise<Object>} { texts: Array, attachments: Array, failedFiles: Array }
   */
  async processAudios(audioFiles) {
    if (!audioFiles || audioFiles.length === 0) {
      return { texts: [], attachments: [], failedFiles: [] };
    }

    // 并行处理所有音频
    const results = await Promise.allSettled(
      audioFiles.map(file => this.processAudioFile(file))
    );

    const texts = [];
    const attachments = [];
    const failedFiles = [];

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        const data = result.value;
        if (data.error) {
          failedFiles.push({
            filename: audioFiles[index].originalname,
            error: data.error
          });
        } else {
          if (data.text) {
            texts.push(data.text);
          }
          if (data.attachment) {
            attachments.push(data.attachment);
          }
        }
      } else {
        failedFiles.push({
          filename: audioFiles[index].originalname,
          error: result.reason?.message || '处理失败'
        });
      }
    });

    return { texts, attachments, failedFiles };
  }

  /**
   * 综合分析所有输入
   * @param {string} textInput - 文本输入
   * @param {Array} imageTexts - 图片提取的文本数组
   * @param {Array} audioTexts - 语音转文字数组
   * @returns {Promise<Object>} AI分析结果
   */
  async analyzeCombinedInput(textInput, imageTexts, audioTexts) {
    // 组合所有文本输入
    const combinedTextParts = [
      textInput,
      ...imageTexts,
      ...audioTexts
    ].filter(Boolean); // 过滤掉空值

    // 如果没有可分析的文本内容，抛出错误
    if (combinedTextParts.length === 0) {
      throw new Error('无法提取可分析的文本内容。请确保图片包含文字或语音清晰可识别。');
    }

    // 组合成完整文本
    const combinedText = combinedTextParts.join('\n\n');

    // 调用文本AI服务综合分析
    const aiInputData = {
      text: combinedText
    };

    const analysisResult = await aiService.analyzeContent(aiInputData);

    // 验证 AI 分析结果
    if (!analysisResult || !analysisResult.type) {
      throw new Error('AI 分析返回结果无效');
    }

    return {
      ...analysisResult,
      combinedText: combinedText
    };
  }

  /**
   * 保存条目和所有附件（使用事务）
   * @param {Object} entryData - 条目数据
   * @param {Array} imageAttachments - 图片附件数组
   * @param {Array} audioAttachments - 语音附件数组
   * @param {string} textInput - 文本输入（可选）
   * @returns {Promise<Object>} 保存的条目
   */
  async saveEntryWithAttachments(entryData, imageAttachments, audioAttachments, textInput = null) {
    return await dbService.transaction(async (client) => {
      // 1. 保存主条目
      const savedEntry = await dbService.createEntryWithClient(entryData, client);

      if (!savedEntry || !savedEntry.id) {
        throw new Error('数据库保存失败：未返回有效的条目ID');
      }

      // 2. 保存图片附件
      for (let i = 0; i < imageAttachments.length; i++) {
        const attachment = imageAttachments[i];
        const attachmentData = {
          entry_id: savedEntry.id,
          input_type: 'image',
          file_path: attachment.file.path,
          file_url: attachment.cosUrl,
          file_size: attachment.file.size,
          mime_type: attachment.file.mimetype,
          raw_text: null,
          transcribed_text: null,
          ocr_text: attachment.ocr_text,
          processed: attachment.processed,
          display_order: i
        };

        await dbService.createEntryAttachment(attachmentData, client);
      }

      // 3. 保存语音附件
      for (let i = 0; i < audioAttachments.length; i++) {
        const attachment = audioAttachments[i];
        const attachmentData = {
          entry_id: savedEntry.id,
          input_type: 'audio',
          file_path: attachment.file.path,
          file_url: attachment.cosUrl,
          file_size: attachment.file.size,
          mime_type: attachment.file.mimetype,
          raw_text: null,
          transcribed_text: attachment.transcribed_text,
          ocr_text: null,
          processed: attachment.processed,
          display_order: imageAttachments.length + i
        };

        await dbService.createEntryAttachment(attachmentData, client);
      }

      // 4. 如果有文本输入，也保存为附件（可选，用于记录原始输入）
      if (textInput) {
        const attachmentData = {
          entry_id: savedEntry.id,
          input_type: 'text',
          file_path: null,
          file_url: null,
          file_size: null,
          mime_type: 'text/plain',
          raw_text: textInput,
          transcribed_text: null,
          ocr_text: null,
          processed: true,
          display_order: imageAttachments.length + audioAttachments.length
        };

        await dbService.createEntryAttachment(attachmentData, client);
      }

      return savedEntry;
    });
  }

  /**
   * 完整的内容分析流程
   * @param {Object} input - { textInput, imageFiles, audioFiles }
   * @returns {Promise<Object>} { entry, failedFiles }
   */
  async analyzeContent(input) {
    const { textInput, imageFiles = [], audioFiles = [] } = input;

    // 1. 处理图片（并行）
    const imageResults = await this.processImages(imageFiles);

    // 2. 处理语音（并行）
    const audioResults = await this.processAudios(audioFiles);

    // 3. 综合分析所有输入
    const analysisResult = await this.analyzeCombinedInput(
      textInput,
      imageResults.texts,
      audioResults.texts
    );

    // 4. 准备条目数据
    const entryData = {
      type: analysisResult.type,
      title: analysisResult.title || null,
      content: analysisResult.content || analysisResult.combinedText || null,
      summary: analysisResult.summary || null,
      keywords: analysisResult.keywords || [],
      tags: analysisResult.tags || [],
      status: analysisResult.status || null,
      completed: analysisResult.completed || null,
      emotion_type: analysisResult.emotion_type || null,
      intensity: analysisResult.intensity || null,
      time: analysisResult.time || null,
      date: analysisResult.date || null,
      location: analysisResult.location || null,
      reminders: Array.isArray(analysisResult.reminders) ? analysisResult.reminders : []
    };

    // 5. 保存到数据库（使用事务）
    const savedEntry = await this.saveEntryWithAttachments(
      entryData,
      imageResults.attachments,
      audioResults.attachments,
      textInput
    );

    // 6. 收集所有失败的文件信息
    const failedFiles = [
      ...imageResults.failedFiles,
      ...audioResults.failedFiles
    ];

    return {
      entry: savedEntry,
      failedFiles: failedFiles
    };
  }
}

module.exports = new AnalyzeService();

