const { BaseContext } = require('./base-context');

class ChatContext extends BaseContext {
  constructor(storageDir, maxSize = 1000) {
    super(storageDir, maxSize);
  }

  getContextId() {
    return 'chat_active';
  }

  addUserMessage(content) {
    var item = {
      id: 'msg_' + Date.now(),
      timestamp: Date.now(),
      role: 'user',
      content: content
    };
    this.add(item);
    return item;
  }

  addAssistantMessage(content) {
    var item = {
      id: 'msg_' + Date.now(),
      timestamp: Date.now(),
      role: 'assistant',
      content: content
    };
    this.add(item);
    return item;
  }

  getConversationForLLM(maxMessages) {
    var messages = this.getLastN(maxMessages || 20);
    return messages.map(function(item) {
      return {
        role: item.role,
        content: item.content
      };
    });
  }

  getLastUserMessage() {
    for (var i = this.items.length - 1; i >= 0; i--) {
      if (this.items[i].role === 'user') {
        return this.items[i];
      }
    }
    return null;
  }

  getLastAssistantMessage() {
    for (var i = this.items.length - 1; i >= 0; i--) {
      if (this.items[i].role === 'assistant') {
        return this.items[i];
      }
    }
    return null;
  }
}

module.exports = { ChatContext };
