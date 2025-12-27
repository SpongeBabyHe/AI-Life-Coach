/* eslint-disable unicorn/prefer-module */
require('dotenv').config({ path: '../.env' });
const db = require('../src/services/dbService');

(async () => {
  try {
    // 1) 插入 entries
    const entry = await db.createEntry({
      type: 'todo',
      title: '测试待办',
      content: '这是一次测试插入',
      summary: null,
      time: '08:00',
      date: '2025-12-31',
      location: '上海',
      status: 'pending',
      completed: false,
      reminders: ['2025-12-31 07:50'],
      emotion_type: null,
      intensity: null,
      tags: ['测试', 'demo'],
      keywords: ['测试', '待办'],
    });
    console.log('insert entry =>', entry);

    // 2) 插入附件（使用上面返回的 entry.id）
    const attachment = await db.createEntryAttachment({
      entry_id: entry.id,
      input_type: 'text',
      file_path: '/tmp/demo.txt',
      file_url: null,
      file_size: 12,
      mime_type: 'text/plain',
      transcribed_text: null,
      ocr_text: null,
      raw_text: 'raw text demo',
      processed: true,
      display_order: 0,
    });
    console.log('insert attachment =>', attachment);
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
})();