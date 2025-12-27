/**
 * Express 服务器主入口文件
 * 
 * 本文件负责：
 * 1. 初始化 Express 应用实例
 * 2. 配置全局中间件（CORS、JSON解析、URL编码解析等）
 * 3. 注册应用路由
 * 4. 启动 HTTP 服务器
 * 5. 提供健康检查端点
 * 
 * 注意：文件上传中间件（multer）在具体路由文件中按需配置，不在此处配置
 */

// ==================== 依赖引入 ====================
const express = require('express'); // Express 框架，用于构建 Web 服务器
const cors = require('cors'); // 跨域资源共享中间件，允许前端从不同域名访问 API
const dotenv = require('dotenv'); // 环境变量管理，从 .env 文件加载配置

// 加载环境变量配置（从项目根目录的 .env 文件读取）
// 包括：数据库连接信息、服务器端口、API密钥等
dotenv.config();

// ==================== 应用初始化 ====================
// 创建 Express 应用实例
const app = express();

// 从环境变量获取服务器监听端口
// 如果未设置，将返回 undefined（需要在 .env 文件中配置 PORT）
const PORT = process.env.PORT;

// ==================== 中间件配置 ====================
// 注意：中间件的顺序很重要，它们会按照注册顺序依次执行

// CORS 中间件：允许跨域请求
// 在生产环境中，应该配置具体的 origin 白名单，而不是允许所有来源
app.use(cors());

// JSON 解析中间件：自动解析请求体中的 JSON 数据
// 解析后的数据可以通过 req.body 访问
app.use(express.json());

// URL 编码解析中间件：解析表单提交的数据（application/x-www-form-urlencoded）
// extended: true 表示使用 qs 库解析，支持嵌套对象
app.use(express.urlencoded({ extended: true }));

// 文件上传中间件（multer）配置说明：
// 业界有两种常见做法：
// 1. 在路由文件中配置（当前采用）- 适合不同路由需要不同配置，或只有少数路由需要文件上传
// 2. 在 server.js 或共享配置文件中配置 - 适合多个路由需要相同配置，便于统一管理
// 当前项目采用方式1，multer 配置在 ./routes/analyze.js 中

// ==================== 路由注册 ====================
// 内容分析路由：处理文本、图片、语音等内容的分析请求
// 路由定义在 ./routes/analyze.js 文件中
// 所有以 /api/analyze 开头的请求都会被转发到该路由处理
app.use('/api/analyze', require('./routes/analyze'));

// 测试路由：用于测试图片AI服务和语音AI服务（开发/测试环境使用）
app.use('/api/test/image', require('./routes/testImage'));
app.use('/api/test/audio', require('./routes/testAudio'));

// COS 连接测试路由
app.get('/api/test/cos', async (req, res) => {
  try {
    const storageService = require('./services/storageService');
    const result = await storageService.testConnection();
    res.json(result);
  } catch (error) {
    console.error('COS 测试路由错误:', error);
    res.status(500).json({
      success: false,
      message: '测试路由执行失败',
      error: error.message
    });
  }
});

// ==================== 健康检查端点 ====================
// 基础健康检查：检查服务器是否正常运行
// 用于监控系统、负载均衡器健康检查等场景
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

// 数据库健康检查：测试数据库连接是否正常
// 引入数据库服务模块（包含连接池和数据库操作方法）
const db = require('./services/dbService');

// 数据库连接检查端点
// 执行简单的 SQL 查询来验证数据库连接是否可用
app.get('/health/db', async (req, res) => {
  try {
    // 执行简单的查询：SELECT 1，用于测试数据库连接
    const result = await db.pool.query('SELECT 1 AS ok');

    // 如果查询成功，返回 ok: true
    res.json({ ok: result.rows[0].ok === 1 });
  } catch (err) {
    // 如果连接失败，记录错误并返回错误信息
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==================== 服务器启动 ====================
// 启动 HTTP 服务器，监听指定端口
// 当服务器成功启动后，会执行回调函数输出日志
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});