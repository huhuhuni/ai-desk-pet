const fs = require('fs');
const path = require('path');

class ScreenshotCapturer {
  constructor(desktopCapturer, saveDir) {
    this.desktopCapturer = desktopCapturer;
    this.saveDir = path.join(saveDir, 'screenshots');
    this.ensureDirectory();
  }

  ensureDirectory() {
    if (!fs.existsSync(this.saveDir)) {
      fs.mkdirSync(this.saveDir, { recursive: true });
    }
  }

  async capture() {
    const sources = await this.desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1920, height: 1080 }
    });

    if (sources.length === 0) {
      throw new Error('No screen sources found');
    }

    // Get primary screen
    const primarySource = sources[0];
    const thumbnail = primarySource.thumbnail;

    if (thumbnail.isEmpty()) {
      throw new Error('Failed to capture screen');
    }

    // 快速检测黑屏（在保存前）
    if (this.isBlackScreen(thumbnail)) {
      console.log('[Screenshot] Black screen detected, skipping save');
      return {
        path: null,
        timestamp: Date.now(),
        isBlackScreen: true
      };
    }

    // Generate filename with timestamp
    const timestamp = Date.now();
    const filename = `screenshot_${timestamp}.png`;
    const filepath = path.join(this.saveDir, filename);

    // Save to file
    const pngData = thumbnail.toPNG();
    fs.writeFileSync(filepath, pngData);

    return {
      path: filepath,
      timestamp: timestamp,
      width: thumbnail.getSize().width,
      height: thumbnail.getSize().height
    };
  }

  isBlackScreen(thumbnail) {
    // 获取缩略图数据并采样检测
    var size = thumbnail.getSize();
    var dataUrl = thumbnail.toDataURL();

    if (!dataUrl || dataUrl.length < 1000) {
      return true;
    }

    // 解析 base64 数据
    var base64Data = dataUrl.split(',')[1];
    if (!base64Data) return true;

    // 采样检测
    var buffer = Buffer.from(base64Data, 'base64');
    var sampleCount = 0;
    var darkCount = 0;
    var step = Math.max(1, Math.floor(buffer.length / 500));

    for (var i = 0; i < buffer.length; i += step) {
      sampleCount++;
      if (buffer[i] < 15) {
        darkCount++;
      }
    }

    return sampleCount > 0 && (darkCount / sampleCount) > 0.95;
  }

  cleanup(maxAge = 24 * 60 * 60 * 1000) {
    // Clean up screenshots older than 24 hours
    const now = Date.now();
    const files = fs.readdirSync(this.saveDir);

    for (const file of files) {
      const filepath = path.join(this.saveDir, file);
      const stats = fs.statSync(filepath);

      if (now - stats.mtimeMs > maxAge) {
        fs.unlinkSync(filepath);
      }
    }
  }
}

module.exports = { ScreenshotCapturer };
