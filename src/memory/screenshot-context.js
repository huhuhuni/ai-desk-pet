const { BaseContext } = require('./base-context');

class ScreenshotContext extends BaseContext {
  constructor(storageDir, maxSize = 1000) {
    super(storageDir, maxSize);
  }

  getContextId() {
    return 'screenshot_active';
  }

  addScreenshot(imagePath, description, summary, tags) {
    var item = {
      id: 'img_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
      timestamp: Date.now(),
      imagePath: imagePath,
      description: description,
      summary: summary || (description ? description.substring(0, 100) : ''),
      tags: tags || []
    };
    this.add(item);
    return item;
  }

  search(query) {
    var lowerQuery = query.toLowerCase();
    return this.items.filter(function(item) {
      return (item.description && item.description.toLowerCase().includes(lowerQuery)) ||
             (item.summary && item.summary.toLowerCase().includes(lowerQuery)) ||
             (item.tags && item.tags.some(function(tag) { return tag.toLowerCase().includes(lowerQuery); }));
    });
  }

  getRecentThemes(count) {
    var recentItems = this.getLastN(50);
    var tagCounts = {};

    recentItems.forEach(function(item) {
      if (item.tags) {
        item.tags.forEach(function(tag) {
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        });
      }
    });

    return Object.entries(tagCounts)
      .sort(function(a, b) { return b[1] - a[1]; })
      .slice(0, count || 5)
      .map(function(entry) { return { tag: entry[0], count: entry[1] }; });
  }
}

module.exports = { ScreenshotContext };
