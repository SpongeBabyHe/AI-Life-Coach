
/* eslint-disable unicorn/prefer-module */ // 使用 CommonJS（require/module.exports）
const dotenv = require('dotenv');

dotenv.config();
// 引入PostgreSQL客户端
const { Pool } = require('pg'); // PostgreSQL connection pool

// 添加数据库连接（校验必要参数并确保端口为数字）
const dbConfig = {
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 5432,
};

const pool = new Pool(dbConfig);

class DBService {
  /**
   * 创建条目
   * @param {Object} data - {type, title, content, summary, time, date, location, status, completed, reminders, emotion_type, intensity, tags, keywords}
   */
  async createEntry(data) {

    const query = `
      INSERT INTO entries (type, title, content, summary, time, date, location, status, completed, reminders, emotion_type, intensity, tags, keywords, created_at, updated_at, deleted_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW(), NULL)
      RETURNING *;
    `;
    const result = await pool.query(query, [
      data.type,
      data.title,
      data.content,
      data.summary,
      data.time,
      data.date,
      data.location,
      data.status,
      data.completed,
      data.reminders,
      data.emotion_type,
      data.intensity,
      data.tags,
      data.keywords
    ]);
    console.log('创建条目:', data);
    return result.rows[0];
  }

  /**
   * 创建附件
   * @param {Object} data - {entry_id, input_type, file_path, file_url, file_size, mime_type, transcribed_text, ocr_text, raw_text, processed, display_order}
   * @param {Object} client - 可选的数据库客户端（用于事务）
   */
  async createEntryAttachment(data, client = null) {
    const query = `
      INSERT INTO entry_attachments (entry_id, input_type, file_path, file_url, file_size, mime_type, transcribed_text, ocr_text, raw_text, processed, created_at, display_order)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), $11)
      RETURNING *;
    `;
    const queryClient = client || pool;
    const result = await queryClient.query(query, [
      data.entry_id,
      data.input_type,
      data.file_path,
      data.file_url,
      data.file_size,
      data.mime_type,
      data.transcribed_text,
      data.ocr_text,
      data.raw_text,
      data.processed,
      data.display_order
    ]);
    console.log('创建附件:', data);
    return result.rows[0];
  }

  /**
   * 创建条目（支持事务）
   * @param {Object} data - 条目数据
   * @param {Object} client - 可选的数据库客户端（用于事务）
   */
  async createEntryWithClient(data, client = null) {
    const query = `
      INSERT INTO entries (type, title, content, summary, time, date, location, status, completed, reminders, emotion_type, intensity, tags, keywords, created_at, updated_at, deleted_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW(), NULL)
      RETURNING *;
    `;
    const queryClient = client || pool;
    const result = await queryClient.query(query, [
      data.type,
      data.title,
      data.content,
      data.summary,
      data.time,
      data.date,
      data.location,
      data.status,
      data.completed,
      data.reminders,
      data.emotion_type,
      data.intensity,
      data.tags,
      data.keywords
    ]);
    return result.rows[0];
  }

  /**
   * 执行事务
   * @param {Function} callback - 事务回调函数，接收 client 作为参数
   * @returns {Promise} 事务执行结果
   */
  async transaction(callback) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
const dbService = new DBService();
// 暴露原始连接池，便于健康检查等轻量查询
dbService.pool = pool;

module.exports = dbService;