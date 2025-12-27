/**
 * 语音AI服务测试路由
 * 
 * 用于测试 audioAIService 是否正常工作
 * 注意：这是测试路由，生产环境可以删除或禁用
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;

// 引入语音AI服务
const audioAIService = require('../services/audioAIService');

// Multer 配置（只接受音频）
const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB（Whisper API 支持更大的文件）
  fileFilter: (req, file, cb) => {
    const extname = path.extname(file.originalname).toLowerCase();
    const allowedTypes = /mp3|wav|m4a|mp4|webm|mpga|mpeg/;
    const isAudioMime = file.mimetype.startsWith('audio/');

    if (allowedTypes.test(extname) && isAudioMime) {
      return cb(null, true);
    }

    return cb(new Error('只支持音频格式：mp3, wav, m4a, mp4, webm, mpga, mpeg'));
  }
});

/**
 * POST /api/test/audio
 * 
 * 测试语音AI服务
 * 上传一个音频文件，返回转写的文字
 */
router.post('/', upload.single('audio'), async (req, res) => {
  const uploadedFilePath = req.file?.path;

  try {
    // 验证文件
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: '请上传一个音频文件，字段名必须是 "audio"'
      });
    }

    // 调用语音AI服务
    const result = await audioAIService.transcribeAudio(req.file, null);

    // 清理临时文件
    if (uploadedFilePath) {
      try {
        await fs.unlink(uploadedFilePath);
      } catch (cleanupError) {
        console.error(`清理临时文件失败 ${uploadedFilePath}:`, cleanupError);
      }
    }

    // 返回结果
    if (result.error) {
      return res.status(500).json({
        success: false,
        message: '语音转文字失败',
        error: result.error,
        result: result
      });
    }

    res.status(200).json({
      success: true,
      message: '语音转文字完成',
      data: {
        transcribed_text: result.transcribed_text,
        filename: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size
      }
    });

  } catch (error) {
    // 清理临时文件
    if (uploadedFilePath) {
      try {
        await fs.unlink(uploadedFilePath);
      } catch (cleanupError) {
        console.error(`清理临时文件失败 ${uploadedFilePath}:`, cleanupError);
      }
    }

    console.error('测试语音AI服务错误:', error);
    res.status(500).json({
      success: false,
      message: '测试失败',
      error: error.message
    });
  }
});

module.exports = router;

