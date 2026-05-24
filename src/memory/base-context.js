const fs = require('fs');
const path = require('path');

class BaseContext {
  constructor(storageDir, maxSize = 1000) {
    this.storageDir = storageDir;
    this.maxSize = maxSize;
    this.archiveDir = path.join(storageDir, 'archive');
    this.activeFile = path.join(storageDir, 'active.json');
    this.items = [];
    this.counter = 0;

    this.ensureDirectory();
    this.load();
  }

  ensureDirectory() {
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
    if (!fs.existsSync(this.archiveDir)) {
      fs.mkdirSync(this.archiveDir, { recursive: true });
    }
  }

  load() {
    try {
      if (fs.existsSync(this.activeFile)) {
        var data = JSON.parse(fs.readFileSync(this.activeFile, 'utf8'));
        this.items = data.items || [];
        this.counter = data.counter || this.items.length;
      }
    } catch (error) {
      console.error('[BaseContext] Error loading:', error.message);
      this.items = [];
      this.counter = 0;
    }
  }

  save() {
    try {
      var data = {
        id: this.getContextId(),
        createdAt: this.items.length > 0 ? this.items[0].timestamp : Date.now(),
        updatedAt: Date.now(),
        count: this.items.length,
        counter: this.counter,
        items: this.items
      };
      fs.writeFileSync(this.activeFile, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('[BaseContext] Error saving:', error.message);
    }
  }

  add(item) {
    this.items.push(item);
    this.counter++;

    if (this.items.length > this.maxSize) {
      this.archive();
    } else {
      this.save();
    }
  }

  getAll() {
    return [...this.items];
  }

  getLastN(n) {
    return this.items.slice(-n);
  }

  getFirstN(n) {
    return this.items.slice(0, n);
  }

  replaceRange(start, end, newItems) {
    this.items.splice(start, end - start, ...newItems);
    this.save();
  }

  size() {
    return this.items.length;
  }

  clear() {
    this.items = [];
    this.counter = 0;
    this.save();
  }

  archive() {
    if (this.items.length === 0) return;

    var batchId = 'batch_' + Date.now();
    var batchFile = path.join(this.archiveDir, batchId + '.json');

    try {
      var batchData = {
        id: batchId,
        archivedAt: Date.now(),
        count: this.items.length,
        items: this.items
      };
      fs.writeFileSync(batchFile, JSON.stringify(batchData, null, 2));
      console.log('[BaseContext] Archived ' + this.items.length + ' items to ' + batchId);

      this.items = [];
      this.save();
    } catch (error) {
      console.error('[BaseContext] Error archiving:', error.message);
    }
  }

  getArchiveCount() {
    try {
      var files = fs.readdirSync(this.archiveDir);
      return files.filter(function(f) { return f.endsWith('.json'); }).length;
    } catch (error) {
      return 0;
    }
  }

  getTotalCount() {
    return this.counter;
  }

  getContextId() {
    return 'active';
  }
}

module.exports = { BaseContext };
