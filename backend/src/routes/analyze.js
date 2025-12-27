/**
 * 内容分析路由
 * 
 * 路由层职责：
 * 1. 接收和解析 HTTP 请求（文本、图片、语音）
 * 2. 参数验证和文件验证
 * 3. 调用服务层处理业务逻辑（AI分析、数据库保存）
 * 4. 格式化并返回 HTTP 响应
 * 5. 统一错误处理
 * 
 * 注意：路由层不包含业务逻辑，只负责请求/响应的协调
 */

// ==================== 依赖引入 ====================
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;

// 引入服务层（业务逻辑层）
const analyzeService = require('../services/analyzeService');

// ==================== Multer 文件上传配置 ====================
// 配置说明：
// - dest: 文件存储目录（相对于项目根目录）
// - limits: 文件大小限制（10MB）
// - fileFilter: 文件类型过滤（只允许图片和音频）

const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    // 根据字段名验证文件类型
    const fieldName = file.fieldname;
    const extname = path.extname(file.originalname).toLowerCase();

    if (fieldName === 'image') {
      // 图片字段：只允许图片格式
      const allowedImageTypes = /jpeg|jpg|png|gif/;
      const isImageMime = file.mimetype.startsWith('image/');

      if (allowedImageTypes.test(extname) && isImageMime) {
        return cb(null, true);
      }

      return cb(new Error('图片字段只支持：jpeg, jpg, png, gif 格式'));

    } else if (fieldName === 'audio') {
      // 音频字段：只允许音频格式
      // 支持 mp3, wav, m4a, webm（MediaRecorder 在 Mac/Chrome 上生成 webm）
      const allowedAudioTypes = /mp3|wav|m4a|webm|ogg/;
      const isAudioMime = file.mimetype.startsWith('audio/');

      if (allowedAudioTypes.test(extname) && isAudioMime) {
        return cb(null, true);
      }

      return cb(new Error('音频字段只支持：mp3, wav, m4a, webm, ogg 格式'));
    }

    // 未知字段名
    cb(new Error(`不支持的字段名: ${fieldName}。只支持 'image' 和 'audio'`));
  }
});

// ==================== 路由处理函数 ====================

/**
 * POST /api/analyze
 * 
 * 统一内容分析路由，支持文本、图片、语音的任意组合输入
 * 
 * 支持的输入方式：
 * 1. 文本输入：通过 req.body.text（可选）
 * 2. 图片输入：通过 multipart/form-data 上传，字段名 'image'（可选，最多5个）
 * 3. 语音输入：通过 multipart/form-data 上传，字段名 'audio'（可选，最多3个）
 * 
 * 业务规则：
 * - 至少需要提供文本、图片或语音中的一种
 * - 如果有多种输入，AI会综合分析所有输入
 * 
 * 处理流程：
 * 1. 验证输入（至少有一种输入）
 * 2. 处理图片（上传COS + OCR/图片AI分析）
 * 3. 处理语音（上传COS + ASR转文字）
 * 4. 综合分析所有输入（文本 + OCR结果 + 转文字结果）
 * 5. 保存分析结果和所有附件到数据库
 * 6. 返回分析结果
 */
router.post('/', upload.fields([
  { name: 'image', maxCount: 5 },  // 最多5张图片
  { name: 'audio', maxCount: 3 }   // 最多3个音频
]), async (req, res) => {
  // 用于跟踪上传的文件，以便在错误时清理
  const uploadedFilePaths = [];

  try {
    // ========== 第一步：提取和验证请求数据 ==========

    // 提取文本输入（可选）
    const textInput = req.body?.text?.trim() || null;

    // 提取文件输入（可选）
    const imageFiles = req.files?.image || [];
    const audioFiles = req.files?.audio || [];

    // 验证：至少需要提供文本、图片或语音中的一种
    if (!textInput && imageFiles.length === 0 && audioFiles.length === 0) {
      return res.status(400).json({
        success: false,
        message: '请至少提供文本、图片或语音中的一种输入'
      });
    }

    // 记录所有文件路径，用于错误时清理
    imageFiles.forEach(file => uploadedFilePaths.push(file.path));
    audioFiles.forEach(file => uploadedFilePaths.push(file.path));

    // ========== 第二步：调用分析服务处理业务逻辑 ==========

    const result = await analyzeService.analyzeContent({
      textInput: textInput,
      imageFiles: imageFiles,
      audioFiles: audioFiles
    });

    // ========== 第三步：返回成功响应 ==========

    const responseData = {
      id: result.entry.id,
      type: result.entry.type,
      title: result.entry.title,
      summary: result.entry.summary,
      keywords: result.entry.keywords,
      tags: result.entry.tags,
      createdAt: result.entry.created_at
    };

    // 如果有文件处理失败，在响应中告知用户
    const warnings = [];
    if (result.failedFiles.length > 0) {
      warnings.push(`部分文件处理失败: ${result.failedFiles.map(f => f.filename).join(', ')}`);
    }

    res.status(200).json({
      success: true,
      message: '内容分析完成',
      data: responseData,
      warnings: warnings.length > 0 ? warnings : undefined
    });

    // ========== 第四步：清理临时文件（成功时）==========
    // 文件已上传到COS，清理本地临时文件
    for (const filePath of uploadedFilePaths) {
      try {
        await fs.unlink(filePath);
      } catch (cleanupError) {
        console.error(`清理临时文件失败 ${filePath}:`, cleanupError);
      }
    }

  } catch (error) {
    // ========== 错误处理 ==========

    console.error('内容分析错误:', {
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });

    // 清理所有临时文件
    for (const filePath of uploadedFilePaths) {
      try {
        await fs.unlink(filePath);
      } catch (cleanupError) {
        console.error(`清理临时文件失败 ${filePath}:`, cleanupError);
      }
    }

    const statusCode = error.statusCode || 500;
    const errorMessage = error.message || '内容分析失败，请稍后重试';

    res.status(statusCode).json({
      success: false,
      message: errorMessage
    });
  }
});

// ==================== 导出路由 ====================
module.exports = router;