const Anthropic = require('@anthropic-ai/sdk');
const OpenAI = require('openai');
const fs = require('fs');

let apiKey = '';
let visionMode = 'openai';
let visionBaseUrl = '';
let visionModel = 'gpt-4o';
let compressImage = true;
let imageQuality = 0.7;

let anthropicClient = null;
let openaiClient = null;

function initClients(mode, baseUrl, model, key, compress, quality) {
  visionMode = mode || visionMode;
  visionBaseUrl = baseUrl || visionBaseUrl;
  visionModel = model || visionModel;
  apiKey = key || apiKey;
  compressImage = compress !== undefined ? compress : compressImage;
  imageQuality = quality !== undefined ? quality : imageQuality;

  if (apiKey) {
    if (visionMode === 'anthropic') {
      anthropicClient = new Anthropic({ apiKey: apiKey });
      openaiClient = null;
    } else if (visionMode === 'openai') {
      var config = { apiKey: apiKey };
      if (visionBaseUrl) {
        config.baseURL = visionBaseUrl;
      }
      openaiClient = new OpenAI(config);
      anthropicClient = null;
    }
  }
}

class VisionWorker {
  constructor(queue) {
    this.queue = queue;
    this.running = true;
  }

  start() {
    console.log('[Vision Worker] Started with mode: ' + visionMode);
  }

  stop() {
    this.running = false;
  }

  updateConfig(mode, baseUrl, model, key, compress, quality) {
    initClients(mode, baseUrl, model, key, compress, quality);
    console.log('[Vision Worker] Config updated - Mode:', visionMode, 'Model:', visionModel, 'BaseURL:', visionBaseUrl || 'default', 'Compress:', compressImage, 'Quality:', imageQuality);
  }

  async process(item) {
    var imagePath = item.path;

    if (!fs.existsSync(imagePath)) {
      throw new Error('Image not found: ' + imagePath);
    }

    var imageBuffer = fs.readFileSync(imagePath);

    // 检测是否是黑屏
    if (this.isBlackScreen(imageBuffer)) {
      console.log('[Vision Worker] Black screen detected, skipping');
      return {
        description: 'Screen is off or black',
        summary: 'Screen off',
        tags: ['black-screen']
      };
    }

    var base64Image = imageBuffer.toString('base64');

    // 压缩图片
    if (compressImage) {
      try {
        var compressed = await this.compressImage(imageBuffer);
        base64Image = compressed.toString('base64');
        console.log('[Vision Worker] Image compressed - Original:', imageBuffer.length, 'Compressed:', compressed.length);
      } catch (e) {
        console.log('[Vision Worker] Compression failed, using original:', e.message);
      }
    }

    console.log('[Vision Worker] Processing - API Key exists:', !!apiKey, 'Mode:', visionMode, 'Model:', visionModel);

    if (!apiKey) {
      console.log('[Vision Worker] No API key, using mock result');
      return this.getMockResult(item);
    }

    try {
      console.log('[Vision Worker] Calling API - BaseURL:', visionBaseUrl || 'default');
      if (visionMode === 'anthropic') {
        return await this.processAnthropic(base64Image);
      } else {
        return await this.processOpenAI(base64Image);
      }
    } catch (error) {
      console.error('[Vision Worker] API Error:', error.message);
      console.error('[Vision Worker] Error stack:', error.stack);
      return this.getMockResult(item);
    }
  }

  isBlackScreen(buffer) {
    // PNG 文件头检测
    // PNG 文件以 89 50 4E 47 开头
    if (buffer.length < 100) return true;

    // 采样检测：检查图片中多个位置的像素是否接近黑色
    // PNG 格式：跳过文件头，采样检测像素数据
    var sampleCount = 0;
    var darkCount = 0;
    var threshold = 15; // RGB 值低于此认为是黑色

    // 简单采样：每隔一定字节检测一次
    // PNG 的像素数据是压缩的，但我们可以通过采样原始字节来估算
    var step = Math.max(1, Math.floor(buffer.length / 1000));

    for (var i = 8; i < buffer.length; i += step) {
      var byte = buffer[i];
      sampleCount++;
      if (byte < threshold) {
        darkCount++;
      }
    }

    // 如果超过 95% 的采样点是暗色，认为是黑屏
    var darkRatio = darkCount / sampleCount;
    return darkRatio > 0.95;
  }

  async compressImage(buffer) {
    // 使用 Electron 的 nativeImage 进行压缩
    var nativeImage;
    try {
      nativeImage = require('electron').nativeImage;
    } catch (e) {
      return buffer; // 如果无法加载 nativeImage，返回原始 buffer
    }

    var image = nativeImage.createFromBuffer(buffer);
    var originalSize = image.getSize();

    // 计算新尺寸（按质量比例缩小）
    var scale = Math.sqrt(imageQuality); // 面积缩放比例
    var newWidth = Math.round(originalSize.width * scale);
    var newHeight = Math.round(originalSize.height * scale);

    // 确保最小尺寸
    if (newWidth < 320) newWidth = 320;
    if (newHeight < 240) newHeight = 240;

    // 缩放图片
    var resized = image.resize({ width: newWidth, height: newHeight, quality: 'good' });

    // 转换为 JPEG 格式（更小的文件）
    return resized.toJPEG(Math.round(imageQuality * 100));
  }

  async processAnthropic(base64Image) {
    if (!anthropicClient) anthropicClient = new Anthropic({ apiKey: apiKey });

    var response = await anthropicClient.messages.create({
      model: visionModel,
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: base64Image } },
          { type: 'text', text: 'Please describe what you see in this image in detail.' }
        ]
      }]
    });

    var description = response.content[0].text;
    var result = this.analyzeDescription(description);
    return { description: description, summary: result.summary, tags: result.tags };
  }

  async processOpenAI(base64Image) {
    if (!openaiClient) {
      var config = { apiKey: apiKey };
      if (visionBaseUrl) {
        config.baseURL = visionBaseUrl;
      }
      openaiClient = new OpenAI(config);
    }

    var response = await openaiClient.chat.completions.create({
      model: visionModel,
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: 'Please describe what you see in this image in detail.' },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,' + base64Image } }
        ]
      }]
    });

    var description = response.choices[0].message.content;
    var result = this.analyzeDescription(description);
    return { description: description, summary: result.summary, tags: result.tags };
  }

  getMockResult(item) {
    var mockDescriptions = [
      'A dark code editor with syntax highlighting. Multiple files are open in tabs.',
      'A web browser showing a modern website with clean design.',
      'A terminal window with command line interface.',
      'A desktop environment with icons on the screen.',
      'A chat application interface with conversation bubbles.'
    ];

    var index = parseInt(item.id.split('_')[1]) % mockDescriptions.length;
    var description = mockDescriptions[index];
    var result = this.analyzeDescription(description);
    return { description: description, summary: result.summary, tags: result.tags };
  }

  analyzeDescription(description) {
    var sentences = description.split(/[.!?]+/);
    var summary = sentences[0].trim() + '.';

    var keywords = ['code', 'editor', 'browser', 'terminal', 'chat', 'app', 'text', 'image', 'button', 'menu', 'window', 'desktop', 'dark', 'light', 'color', 'video', 'document', 'file'];
    var tags = keywords.filter(function(keyword) {
      return description.toLowerCase().includes(keyword);
    });

    return { summary: summary, tags: tags };
  }
}

module.exports = { VisionWorker };
