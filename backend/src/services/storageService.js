/**
 * 存储服务（COS上传）
 *
 * 职责：
 * 1) 将临时上传的图片和音频文件转存到云存储(对象存储)
 * 2) 生成图片和音频文件的 URL/签名，用于前端展示
 * 3) 删除临时文件，释放磁盘空间
 */

const COS = require('cos-nodejs-sdk-v5');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

dotenv.config();

// MIME类型到文件扩展名的映射
const MIME_TO_EXT = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'audio/mpeg': '.mp3',
  'audio/mp3': '.mp3',
  'audio/wav': '.wav',
  'audio/m4a': '.m4a',
  'audio/mp4': '.m4a',
  'audio/webm': '.webm'
};

// 文件类型到目录的映射
const TYPE_TO_FOLDER = {
  'image': 'images',
  'audio': 'audios',
  'default': 'uploads'
};

class StorageService {
  constructor() {
    this.config = this._loadConfig();
    this.cos = this._initCOS();
  }

  /**
   * 加载配置
   * @private
   */
  _loadConfig() {
    return {
      SecretId: process.env.COS_SECRET_ID,
      SecretKey: process.env.COS_SECRET_KEY,
      Bucket: process.env.COS_BUCKET,
      Region: process.env.COS_REGION,
      domain: process.env.COS_DOMAIN
    };
  }

  /**
   * 初始化COS客户端
   * @private
   */
  _initCOS() {
    return new COS({
      SecretId: this.config.SecretId,
      SecretKey: this.config.SecretKey
    });
  }

  /**
   * 将COS SDK的回调函数转换为Promise
   * @private
   */
  _promisify(cosMethod, params) {
    return new Promise((resolve, reject) => {
      cosMethod(params, (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
    });
  }

  /**
   * 生成唯一的文件key（路径）
   * 采用业界最佳实践：
   * - 使用UUID v4确保唯一性
   * - 按日期分层（YYYY/MM）提高查询性能
   * - 保留扩展名用于内容类型识别
   * 
   * @param {string} originalname - 原始文件名
   * @param {string} mimetype - MIME类型
   * @returns {string} 文件key，格式：{type}/{YYYY}/{MM}/{uuid}.{ext}
   */
  generateFileKey(originalname, mimetype) {
    // 根据文件类型选择目录
    const folder = this._getFolderByMimeType(mimetype);

    // 按日期分层：YYYY/MM
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');

    // 生成UUID v4作为唯一标识符
    const uuid = uuidv4();

    // 获取文件扩展名
    const ext = path.extname(originalname) || this._getExtensionFromMimeType(mimetype);

    // 格式：{type}/{YYYY}/{MM}/{uuid}.{ext}
    return `${folder}/${year}/${month}/${uuid}${ext}`;
  }

  /**
   * 根据MIME类型获取目录
   * @private
   */
  _getFolderByMimeType(mimetype) {
    if (mimetype.startsWith('image/')) {
      return TYPE_TO_FOLDER.image;
    } else if (mimetype.startsWith('audio/')) {
      return TYPE_TO_FOLDER.audio;
    }
    return TYPE_TO_FOLDER.default;
  }

  /**
   * 根据MIME类型获取文件扩展名
   * @private
   */
  _getExtensionFromMimeType(mimetype) {
    return MIME_TO_EXT[mimetype] || '';
  }

  /**
   * 准备上传的Body（优先使用Stream，否则使用Buffer）
   * @private
   */
  _prepareBody(filePath, buffer) {
    if (filePath && fs.existsSync(filePath)) {
      return fs.createReadStream(filePath);
    } else if (buffer) {
      return buffer;
    }
    throw new Error('文件数据为空：需要提供 buffer 或 path');
  }

  /**
   * 上传文件到COS
   * @param {Object} fileData - { buffer, originalname, mimetype, path } (path 可选，如果有则使用 Stream)
   * @returns {Promise<Object>} { url: string } COS URL
   */
  async uploadToCOS(fileData) {
    const { buffer, originalname, mimetype, path: filePath } = fileData;

    // 验证配置
    if (!this.config.Bucket || !this.config.Region) {
      throw new Error(`COS 配置错误: Bucket=${this.config.Bucket}, Region=${this.config.Region}`);
    }

    // 生成文件key
    const key = this.generateFileKey(originalname, mimetype);

    try {
      // 准备上传Body
      const body = this._prepareBody(filePath, buffer);

      // 上传到COS
      await this._promisify(this.cos.putObject.bind(this.cos), {
        Bucket: this.config.Bucket,
        Region: this.config.Region,
        Key: key,
        Body: body,
        ContentType: mimetype
      });

      // 生成访问URL
      const url = `${this.config.domain}/${key}`;
      return { url };

    } catch (error) {
      const errorMessage = this._formatError(error);
      console.error('COS上传失败:', errorMessage);
      throw new Error(`COS上传失败: ${errorMessage}`);
    }
  }

  /**
   * 格式化错误信息
   * @private
   */
  _formatError(error) {
    if (error.statusCode) {
      return `HTTP ${error.statusCode}: ${error.message || '未知错误'}`;
    }
    return error.message || '未知错误';
  }

  /**
   * 删除COS中的文件
   * @param {string} key - 文件key
   * @returns {Promise<void>}
   */
  async deleteFromCOS(key) {
    try {
      await this._promisify(this.cos.deleteObject.bind(this.cos), {
        Bucket: this.config.Bucket,
        Region: this.config.Region,
        Key: key
      });
    } catch (error) {
      console.error('COS删除失败:', error.message);
      throw new Error(`COS删除失败: ${error.message}`);
    }
  }

  /**
   * 从URL中提取文件key
   * @param {string} url - COS URL
   * @returns {string} 文件key
   */
  extractKeyFromUrl(url) {
    const match = url.match(/\.myqcloud\.com\/(.+)$/);
    return match ? match[1] : url;
  }

  /**
   * 测试 COS 连接和配置
   * @returns {Promise<Object>} 测试结果
   */
  async testConnection() {
    if (!this.cos) {
      return { success: false, message: 'COS 客户端未初始化' };
    }

    const results = {
      headBucket: await this._testHeadBucket(),
      putObject: await this._testPutObject()
    };

    return {
      success: results.headBucket.success && results.putObject.success,
      message: results.putObject.success
        ? 'COS 连接和写入权限测试成功'
        : 'COS 连接成功，但写入权限可能有问题',
      results
    };
  }

  /**
   * 测试headBucket（读取权限）
   * @private
   */
  async _testHeadBucket() {
    try {
      const data = await this._promisify(this.cos.headBucket.bind(this.cos), {
        Bucket: this.config.Bucket,
        Region: this.config.Region
      });
      return { success: true, data };
    } catch (error) {
      return {
        success: false,
        error: {
          statusCode: error.statusCode,
          code: error.code,
          message: error.message
        }
      };
    }
  }

  /**
   * 测试putObject（写入权限）
   * @private
   */
  async _testPutObject() {
    const testKey = 'test/connection-test.txt';
    const testContent = Buffer.from(`COS connection test - ${new Date().toISOString()}`);
    const uploadsDir = path.join(__dirname, '../../uploads');
    const tempFilePath = path.join(uploadsDir, `test-${Date.now()}.txt`);

    try {
      // 确保 uploads 目录存在
      await fs.promises.mkdir(uploadsDir, { recursive: true });

      // 创建临时文件
      await fs.promises.writeFile(tempFilePath, testContent);

      // 上传测试文件
      const data = await this._promisify(this.cos.putObject.bind(this.cos), {
        Bucket: this.config.Bucket,
        Region: this.config.Region,
        Key: testKey,
        Body: fs.createReadStream(tempFilePath),
        ContentType: 'text/plain'
      });

      // 清理临时文件
      await fs.promises.unlink(tempFilePath).catch(() => { });

      // 尝试删除测试文件
      const cleaned = await this._tryDeleteTestFile(testKey);

      return { success: true, data, testKey, cleaned };

    } catch (error) {
      // 清理临时文件（如果存在）
      await fs.promises.unlink(tempFilePath).catch(() => { });

      return {
        success: false,
        error: {
          statusCode: error.statusCode,
          code: error.code,
          message: error.message,
          error: error.error
        }
      };
    }
  }

  /**
   * 尝试删除测试文件
   * @private
   */
  async _tryDeleteTestFile(testKey) {
    try {
      await this._promisify(this.cos.deleteObject.bind(this.cos), {
        Bucket: this.config.Bucket,
        Region: this.config.Region,
        Key: testKey
      });
      return true;
    } catch (error) {
      return false;
    }
  }
}

module.exports = new StorageService();
