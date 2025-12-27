/**
 * 图片AI服务测试路由
 * 
 * 用于测试 imageAIService 是否正常工作
 * 注意：这是测试路由，生产环境可以删除或禁用
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;

// 引入图片AI服务
const imageAIService = require('../services/imageAIService');

// Multer 配置（只接受图片）
const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const extname = path.extname(file.originalname).toLowerCase();
    const allowedTypes = /jpeg|jpg|png|gif/;
    const isImageMime = file.mimetype.startsWith('image/');

    if (allowedTypes.test(extname) && isImageMime) {
      return cb(null, true);
    }

    return cb(new Error('只支持图片格式：jpeg, jpg, png, gif'));
  }
});

/**
 * POST /api/test/image
 * 
 * 测试图片AI服务
 * 上传一张图片，返回 OCR 文本和摘要
 */
router.post('/', upload.single('image'), async (req, res) => {
  const uploadedFilePath = req.file?.path;

  try {
    // 验证文件
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: '请上传一张图片文件，字段名必须是 "image"'
      });
    }

    // 调用图片AI服务
    const result = await imageAIService.analyzeImage(req.file, null);

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
        message: '图片AI分析失败',
        error: result.error,
        result: result
      });
    }

    res.status(200).json({
      success: true,
      message: '图片分析完成',
      data: {
        ocr_text: result.ocr_text,
        summary: result.summary,
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

    console.error('测试图片AI服务错误:', error);
    res.status(500).json({
      success: false,
      message: '测试失败',
      error: error.message
    });
  }
});

module.exports = router;

