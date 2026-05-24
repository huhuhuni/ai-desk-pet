const { VisionWorker } = require('./worker');

class VisionQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
    this.results = [];
    this.maxResults = 1000;
    this.maxQueueSize = 5; // 最大队列长度，超过则丢弃旧的
    this.worker = new VisionWorker(this);
    this.memoryManager = null;

    this.worker.start();
  }

  setMemoryManager(manager) {
    this.memoryManager = manager;
  }

  add(item) {
    // 如果队列已满，丢弃最旧的任务
    if (this.queue.length >= this.maxQueueSize) {
      var dropped = this.queue.shift();
      console.log('[Vision Queue] Queue full, dropping old item: ' + dropped.id);
    }

    this.queue.push(item);
    console.log('[Vision Queue] Added item, queue size: ' + this.queue.length);

    // 如果队列积压严重，只保留最新的
    while (this.queue.length > this.maxQueueSize) {
      var dropped = this.queue.shift();
      console.log('[Vision Queue] Dropping old item to catch up: ' + dropped.id);
    }

    this.processNext();
  }

  async processNext() {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;
    const item = this.queue.shift();
    const startTime = Date.now();

    try {
      const result = await this.worker.process(item);
      const elapsed = Date.now() - startTime;

      // 黑屏结果不入库
      if (result.tags && result.tags.includes('black-screen')) {
        console.log('[Vision Queue] Black screen skipped, not stored');
      } else {
        console.log('[Vision Queue] Processed in ' + elapsed + 'ms, queue remaining: ' + this.queue.length);

        this.results.push({
          id: item.id,
          timestamp: item.timestamp,
          imagePath: item.path,
          description: result.description,
          summary: result.summary,
          tags: result.tags || []
        });

        if (this.results.length > this.maxResults) {
          this.results.shift();
        }

        if (this.memoryManager) {
          this.memoryManager.add({
            id: item.id,
            timestamp: item.timestamp,
            imagePath: item.path,
            description: result.description,
            summary: result.summary
          });
        }

        if (global.mainWindow && !global.mainWindow.isDestroyed()) {
          global.mainWindow.webContents.send('vision-result', result);
        }
      }

    } catch (error) {
      console.error('[Vision Queue] Error processing item:', error);
    } finally {
      this.processing = false;
      this.processNext();
    }
  }

  getLatestResults(count = 10) {
    return this.results.slice(-count);
  }

  getAllResults() {
    return [...this.results];
  }

  clear() {
    this.queue = [];
    this.results = [];
  }
}

module.exports = { VisionQueue };
