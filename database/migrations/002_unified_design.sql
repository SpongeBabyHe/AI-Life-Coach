-- 方案一：统一表设计（推荐用于快速记事）
-- 支持语音/文字/图片混合输入

-- 统一内容表
CREATE TABLE IF NOT EXISTS entries (
    id SERIAL PRIMARY KEY,
    type VARCHAR(20) NOT NULL CHECK (type IN ('todo', 'idea', 'mood')),
    
    -- 核心内容（AI分析后的结构化数据）
    title TEXT,                    -- 提取的标题/待办项
    content TEXT,                  -- 完整内容文本
    summary TEXT,                  -- AI生成的摘要
    time TEXT,
    date TEXT,
    
    -- 待办特定字段（仅type='todo'时使用，可为NULL）
    location TEXT,
    status VARCHAR(20) DEFAULT 'pending',
    completed BOOLEAN DEFAULT FALSE,
    reminders TEXT[],
    
    -- 想法/心情特定字段（可选）
    emotion_type VARCHAR(50),      -- 心情类型：happy, sad, anxious等
    intensity INTEGER,              -- 心情强度 1-10
    
    -- 标签和分类
    tags TEXT[],                  -- 标签，用户可见
    keywords TEXT[],               -- AI提取的关键词
    
    -- 元数据
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP
);

-- 原始输入资源表（存储语音、图片等文件）
CREATE TABLE IF NOT EXISTS entry_attachments (
    id SERIAL PRIMARY KEY,
    entry_id INTEGER REFERENCES entries(id) ON DELETE CASCADE,
    
    -- 输入类型
    input_type VARCHAR(20) NOT NULL CHECK (input_type IN ('text', 'audio', 'image')),
    
    -- 文件信息
    file_path TEXT,                -- 文件存储路径（本地或对象存储路径）
    file_url TEXT,                 -- 文件访问URL
    file_size BIGINT,              -- 文件大小（字节）
    mime_type VARCHAR(100),        -- MIME类型（如：audio/mpeg, image/jpeg）
    
    -- 处理信息
    transcribed_text TEXT,         -- 语音转文字结果
    ocr_text TEXT,                 -- 图片OCR结果
    raw_text TEXT,                 -- 原始文本输入（input_type='text'时）
    processed BOOLEAN DEFAULT FALSE, -- 是否已处理（转文字/OCR）
    
    -- 元数据
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    display_order INTEGER DEFAULT 0 -- 显示顺序（支持多个附件）
);

-- 索引优化
CREATE INDEX IF NOT EXISTS idx_entries_type ON entries(type);
CREATE INDEX IF NOT EXISTS idx_entries_created_at ON entries(created_at DESC); -- 降序，快速获取最新
CREATE INDEX IF NOT EXISTS idx_entries_tags ON entries USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_entries_keywords ON entries USING GIN(keywords);
CREATE INDEX IF NOT EXISTS idx_entries_status ON entries(status) WHERE type = 'todo' AND completed = FALSE;
CREATE INDEX IF NOT EXISTS idx_entries_deleted ON entries(deleted_at) WHERE deleted_at IS NULL; -- 软删除索引

CREATE INDEX IF NOT EXISTS idx_attachments_entry_id ON entry_attachments(entry_id);
CREATE INDEX IF NOT EXISTS idx_attachments_input_type ON entry_attachments(input_type);
CREATE INDEX IF NOT EXISTS idx_attachments_processed ON entry_attachments(processed) WHERE processed = FALSE;

-- 触发器：自动更新updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_entries_updated_at BEFORE UPDATE ON entries
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

