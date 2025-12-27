/**
 * 文本 API 压力测试和边界测试脚本
 * 
 * 测试内容：
 * 1. 边界测试：空文本、超长文本、特殊字符、各种类型的内容
 * 2. 压力测试：并发请求、大量请求
 * 3. 错误处理测试：无效输入、网络错误等
 * 
 * 使用方法：
 * node scripts/test-text-api.js
 */

const axios = require('axios');
require('dotenv').config();

const BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const API_ENDPOINT = `${BASE_URL}/api/analyze`;

// 测试结果统计
const testResults = {
  passed: 0,
  failed: 0,
  errors: [],
  performance: []
};

/**
 * 运行单个测试
 */
async function runTest(name, testFn, isAsync = false) {
  const startTime = Date.now();
  try {
    if (isAsync) {
      await testFn();
    } else {
      await testFn();
    }
    const duration = Date.now() - startTime;
    console.log(`✅ 通过: ${name} (${duration}ms)`);
    testResults.passed++;
    testResults.performance.push({ name, duration, status: 'success' });
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`❌ 失败: ${name} (${duration}ms)`);
    console.error(`   错误: ${error.message}`);
    if (error.response) {
      console.error(`   状态码: ${error.response.status}`);
      console.error(`   响应:`, JSON.stringify(error.response.data, null, 2));
    }
    testResults.failed++;
    testResults.errors.push({ name, error: error.message, duration });
    testResults.performance.push({ name, duration, status: 'failed' });
  }
}

// ==================== 边界测试 ====================

/**
 * 测试 1: 空字符串
 */
async function testEmptyString() {
  const response = await axios.post(API_ENDPOINT, { text: '' });
  if (response.status !== 400) {
    throw new Error(`期望 400，实际 ${response.status}`);
  }
}

/**
 * 测试 2: 只有空白字符
 */
async function testWhitespaceOnly() {
  const response = await axios.post(API_ENDPOINT, { text: '   \n\t   ' });
  if (response.status !== 400) {
    throw new Error(`期望 400，实际 ${response.status}`);
  }
}

/**
 * 测试 3: 超长文本（超过 10000 字符）
 */
async function testVeryLongText() {
  const longText = '这是一个很长的文本。'.repeat(1000); // 约 8000 字符
  const response = await axios.post(API_ENDPOINT, { text: longText });
  if (response.status !== 200 || !response.data.success) {
    throw new Error('超长文本处理失败');
  }
}

/**
 * 测试 4: 特殊字符
 */
async function testSpecialCharacters() {
  const specialText = '!@#$%^&*()_+-=[]{}|;:,.<>?/~`';
  const response = await axios.post(API_ENDPOINT, { text: specialText });
  if (response.status !== 200 || !response.data.success) {
    throw new Error('特殊字符处理失败');
  }
}

/**
 * 测试 5: 中英文混合
 */
async function testMixedLanguages() {
  const mixedText = '明天早上 8:00 AM 记得买牛奶 Buy milk tomorrow morning';
  const response = await axios.post(API_ENDPOINT, { text: mixedText });
  if (response.status !== 200 || !response.data.success) {
    throw new Error('中英文混合处理失败');
  }
}

/**
 * 测试 6: 表情符号
 */
async function testEmojis() {
  const emojiText = '今天心情很好 😊 工作顺利 👍';
  const response = await axios.post(API_ENDPOINT, { text: emojiText });
  if (response.status !== 200 || !response.data.success) {
    throw new Error('表情符号处理失败');
  }
}

/**
 * 测试 7: 数字和日期
 */
async function testNumbersAndDates() {
  const numberText = '2025年12月20日 下午3点30分 预算5000元';
  const response = await axios.post(API_ENDPOINT, { text: numberText });
  if (response.status !== 200 || !response.data.success) {
    throw new Error('数字和日期处理失败');
  }
}

/**
 * 测试 8: 模糊的待办事项
 */
async function testAmbiguousTodo() {
  const ambiguousText = '那个事情';
  const response = await axios.post(API_ENDPOINT, { text: ambiguousText });
  if (response.status !== 200 || !response.data.success) {
    throw new Error('模糊内容处理失败');
  }
}

/**
 * 测试 9: 多行文本
 */
async function testMultilineText() {
  const multilineText = `第一行内容
第二行内容
第三行内容`;
  const response = await axios.post(API_ENDPOINT, { text: multilineText });
  if (response.status !== 200 || !response.data.success) {
    throw new Error('多行文本处理失败');
  }
}

/**
 * 测试 10: JSON 格式的文本（可能被误解析）
 */
async function testJsonLikeText() {
  const jsonText = '{"key": "value"} 这是一个待办事项';
  const response = await axios.post(API_ENDPOINT, { text: jsonText });
  if (response.status !== 200 || !response.data.success) {
    throw new Error('JSON 格式文本处理失败');
  }
}

// ==================== 类型分类测试 ====================

/**
 * 测试 11: 明确的待办事项
 */
async function testClearTodo() {
  const todoText = '明天早上8点记得买牛奶和面包';
  const response = await axios.post(API_ENDPOINT, { text: todoText });
  if (response.status !== 200 || !response.data.success) {
    throw new Error('待办事项识别失败');
  }
  if (response.data.data.type !== 'todo') {
    throw new Error(`期望类型 todo，实际 ${response.data.data.type}`);
  }
}

/**
 * 测试 12: 明确的想法
 */
async function testClearIdea() {
  const ideaText = '我想做一个待办事项应用，可以支持语音输入和图片识别';
  const response = await axios.post(API_ENDPOINT, { text: ideaText });
  if (response.status !== 200 || !response.data.success) {
    throw new Error('想法识别失败');
  }
  if (response.data.data.type !== 'idea') {
    throw new Error(`期望类型 idea，实际 ${response.data.data.type}`);
  }
}

/**
 * 测试 13: 明确的心情
 */
async function testClearMood() {
  const moodText = '今天心情很好，阳光明媚，工作进展顺利，感觉很充实';
  const response = await axios.post(API_ENDPOINT, { text: moodText });
  if (response.status !== 200 || !response.data.success) {
    throw new Error('心情识别失败');
  }
  if (response.data.data.type !== 'mood') {
    throw new Error(`期望类型 mood，实际 ${response.data.data.type}`);
  }
}

// ==================== 错误处理测试 ====================

/**
 * 测试 14: 缺少 text 字段
 */
async function testMissingTextField() {
  try {
    await axios.post(API_ENDPOINT, {});
    throw new Error('应该返回 400 错误');
  } catch (error) {
    if (error.response && error.response.status === 400) {
      return; // 预期的错误
    }
    throw error;
  }
}

/**
 * 测试 15: 无效的 JSON
 */
async function testInvalidJson() {
  try {
    await axios.post(API_ENDPOINT, '这不是 JSON', {
      headers: { 'Content-Type': 'application/json' }
    });
    throw new Error('应该返回错误');
  } catch (error) {
    // 预期会失败
    if (!error.response || error.response.status < 400) {
      throw new Error('应该返回 400 或 500 错误');
    }
  }
}

/**
 * 测试 16: null 值
 */
async function testNullValue() {
  try {
    await axios.post(API_ENDPOINT, { text: null });
    throw new Error('应该返回 400 错误');
  } catch (error) {
    if (error.response && error.response.status === 400) {
      return;
    }
    throw error;
  }
}

// ==================== 压力测试 ====================

/**
 * 测试 17: 并发请求（10个同时）
 */
async function testConcurrentRequests() {
  const requests = Array(10).fill(null).map(() =>
    axios.post(API_ENDPOINT, { text: '测试并发请求' })
  );

  const responses = await Promise.all(requests);

  const failed = responses.filter(r => r.status !== 200 || !r.data.success);
  if (failed.length > 0) {
    throw new Error(`${failed.length} 个并发请求失败`);
  }

  console.log(`   ✅ 10 个并发请求全部成功`);
}

/**
 * 测试 18: 快速连续请求（20个，间隔 100ms）
 */
async function testRapidRequests() {
  const results = [];
  for (let i = 0; i < 20; i++) {
    const start = Date.now();
    try {
      const response = await axios.post(API_ENDPOINT, {
        text: `快速请求 ${i + 1}`
      });
      const duration = Date.now() - start;
      results.push({ success: true, duration });
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      results.push({ success: false, error: error.message });
    }
  }

  const failed = results.filter(r => !r.success);
  if (failed.length > 0) {
    throw new Error(`${failed.length} 个快速请求失败`);
  }

  const avgDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length;
  console.log(`   ✅ 20 个快速请求全部成功，平均响应时间: ${avgDuration.toFixed(0)}ms`);
}

/**
 * 测试 19: 大量请求（50个）
 */
async function testManyRequests() {
  const requests = Array(50).fill(null).map((_, i) =>
    axios.post(API_ENDPOINT, { text: `批量请求 ${i + 1}` })
  );

  const start = Date.now();
  const responses = await Promise.allSettled(requests);
  const duration = Date.now() - start;

  const successful = responses.filter(r =>
    r.status === 'fulfilled' && r.value.status === 200
  ).length;

  const failed = responses.filter(r =>
    r.status === 'rejected' || (r.status === 'fulfilled' && r.value.status !== 200)
  ).length;

  console.log(`   ✅ 成功: ${successful}, 失败: ${failed}, 总耗时: ${duration}ms`);

  if (failed > 5) { // 允许少量失败
    throw new Error(`失败请求过多: ${failed}`);
  }
}

// ==================== 数据验证测试 ====================

/**
 * 测试 20: 验证返回数据结构
 */
async function testResponseStructure() {
  const response = await axios.post(API_ENDPOINT, {
    text: '明天早上8点记得买牛奶'
  });

  const data = response.data;

  // 验证顶层结构
  if (!data.hasOwnProperty('success')) {
    throw new Error('缺少 success 字段');
  }
  if (!data.hasOwnProperty('message')) {
    throw new Error('缺少 message 字段');
  }
  if (!data.hasOwnProperty('data')) {
    throw new Error('缺少 data 字段');
  }

  // 验证 data 结构
  const dataFields = ['id', 'type', 'title', 'summary', 'keywords', 'tags', 'createdAt'];
  for (const field of dataFields) {
    if (!data.data.hasOwnProperty(field)) {
      throw new Error(`缺少字段: ${field}`);
    }
  }

  // 验证类型
  const validTypes = ['todo', 'idea', 'mood'];
  if (!validTypes.includes(data.data.type)) {
    throw new Error(`无效的类型: ${data.data.type}`);
  }

  // 验证数组类型
  if (!Array.isArray(data.data.keywords)) {
    throw new Error('keywords 应该是数组');
  }
  if (!Array.isArray(data.data.tags)) {
    throw new Error('tags 应该是数组');
  }
}

/**
 * 测试 21: 验证字段长度限制
 */
async function testFieldLengthLimits() {
  const response = await axios.post(API_ENDPOINT, {
    text: '这是一个测试'
  });

  const data = response.data.data;

  // 验证 title 长度（应该 <= 80）
  if (data.title && data.title.length > 80) {
    throw new Error(`title 长度超过限制: ${data.title.length}`);
  }

  // 验证 summary 长度（应该 <= 120）
  if (data.summary && data.summary.length > 120) {
    throw new Error(`summary 长度超过限制: ${data.summary.length}`);
  }

  // 验证 keywords 数量（应该 <= 5）
  if (data.keywords && data.keywords.length > 5) {
    throw new Error(`keywords 数量超过限制: ${data.keywords.length}`);
  }

  // 验证 tags 数量（应该 <= 5）
  if (data.tags && data.tags.length > 5) {
    throw new Error(`tags 数量超过限制: ${data.tags.length}`);
  }
}

// ==================== 主测试函数 ====================

async function runAllTests() {
  console.log('='.repeat(60));
  console.log('开始文本 API 压力测试和边界测试');
  console.log(`服务器地址: ${BASE_URL}`);
  console.log('='.repeat(60));

  // 先测试服务器是否可访问
  try {
    await axios.get(`${BASE_URL}/health`, { timeout: 5000 });
  } catch (error) {
    console.error('\n❌ 无法连接到服务器！');
    console.error('请确保后端服务器正在运行：');
    console.error('  cd backend && npm start');
    process.exit(1);
  }

  console.log('\n📋 边界测试');
  console.log('-'.repeat(60));
  await runTest('空字符串', testEmptyString);
  await runTest('只有空白字符', testWhitespaceOnly);
  await runTest('超长文本', testVeryLongText);
  await runTest('特殊字符', testSpecialCharacters);
  await runTest('中英文混合', testMixedLanguages);
  await runTest('表情符号', testEmojis);
  await runTest('数字和日期', testNumbersAndDates);
  await runTest('模糊的待办事项', testAmbiguousTodo);
  await runTest('多行文本', testMultilineText);
  await runTest('JSON 格式文本', testJsonLikeText);

  console.log('\n📋 类型分类测试');
  console.log('-'.repeat(60));
  await runTest('明确的待办事项', testClearTodo);
  await runTest('明确的想法', testClearIdea);
  await runTest('明确的心情', testClearMood);

  console.log('\n📋 错误处理测试');
  console.log('-'.repeat(60));
  await runTest('缺少 text 字段', testMissingTextField);
  await runTest('无效的 JSON', testInvalidJson);
  await runTest('null 值', testNullValue);

  console.log('\n📋 数据验证测试');
  console.log('-'.repeat(60));
  await runTest('返回数据结构', testResponseStructure);
  await runTest('字段长度限制', testFieldLengthLimits);

  console.log('\n📋 压力测试');
  console.log('-'.repeat(60));
  await runTest('并发请求（10个）', testConcurrentRequests);
  await runTest('快速连续请求（20个）', testRapidRequests);
  await runTest('大量请求（50个）', testManyRequests);

  // 输出测试结果摘要
  console.log('\n' + '='.repeat(60));
  console.log('测试结果摘要');
  console.log('='.repeat(60));
  console.log(`✅ 通过: ${testResults.passed}`);
  console.log(`❌ 失败: ${testResults.failed}`);
  console.log(`总计: ${testResults.passed + testResults.failed}`);

  // 性能统计
  if (testResults.performance.length > 0) {
    const successful = testResults.performance.filter(p => p.status === 'success');
    if (successful.length > 0) {
      const durations = successful.map(p => p.duration);
      const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
      const minDuration = Math.min(...durations);
      const maxDuration = Math.max(...durations);

      console.log('\n📊 性能统计');
      console.log('-'.repeat(60));
      console.log(`平均响应时间: ${avgDuration.toFixed(0)}ms`);
      console.log(`最快响应: ${minDuration}ms`);
      console.log(`最慢响应: ${maxDuration}ms`);
    }
  }

  if (testResults.errors.length > 0) {
    console.log('\n❌ 失败的测试:');
    testResults.errors.forEach(({ name, error }) => {
      console.log(`  - ${name}: ${error}`);
    });
  }

  // 如果有失败的测试，退出码为 1
  process.exit(testResults.failed > 0 ? 1 : 0);
}

// 运行测试
runAllTests().catch((error) => {
  console.error('\n❌ 测试执行出错:', error);
  process.exit(1);
});

