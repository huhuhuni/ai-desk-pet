const Anthropic = require('@anthropic-ai/sdk');
const OpenAI = require('openai');

let apiKey = '';
let textMode = 'openai';
let textBaseUrl = '';
let textModel = 'gpt-4o';

let anthropicClient = null;
let openaiClient = null;

function initClients(mode, baseUrl, model, key) {
  textMode = mode || textMode;
  textBaseUrl = baseUrl || textBaseUrl;
  textModel = model || textModel;
  apiKey = key || apiKey;

  if (apiKey) {
    if (textMode === 'anthropic') {
      anthropicClient = new Anthropic({ apiKey: apiKey });
      openaiClient = null;
    } else if (textMode === 'openai') {
      var config = { apiKey: apiKey };
      if (textBaseUrl) {
        config.baseURL = textBaseUrl;
      }
      openaiClient = new OpenAI(config);
      anthropicClient = null;
    }
  }
}

class AgentEvaluator {
  constructor(store, visionQueue, chatContext, screenshotContext) {
    this.store = store;
    this.visionQueue = visionQueue;
    this.chatContext = chatContext;
    this.screenshotContext = screenshotContext;
    this.lastCommentTime = 0;
    this.minCommentInterval = 30000;
  }

  updateConfig(mode, baseUrl, model, key) {
    initClients(mode, baseUrl, model, key);
    console.log('[Agent Evaluator] Config updated - Mode:', textMode, 'Model:', textModel, 'BaseURL:', textBaseUrl || 'default');
  }

  async evaluate() {
    var settings = {
      enthusiasmLevel: this.store.get('enthusiasmLevel'),
      commentsEnabled: this.store.get('commentsEnabled')
    };

    if (!settings.commentsEnabled) {
      console.log('[Agent Evaluator] Comments disabled');
      return null;
    }

    // 优先从 screenshotContext 获取持久化数据，fallback 到 visionQueue 内存数据
    var recentResults = this.screenshotContext
      ? this.screenshotContext.getLastN(20)
      : this.visionQueue.getLatestResults(20);
    console.log('[Agent Evaluator] Recent results count:', recentResults.length);

    if (recentResults.length < 3) {
      console.log('[Agent Evaluator] Not enough results, need at least 3');
      return null;
    }

    var now = Date.now();
    if (now - this.lastCommentTime < this.minCommentInterval) {
      console.log('[Agent Evaluator] Too soon since last comment');
      return null;
    }

    var baseProbability = settings.enthusiasmLevel / 10;

    var analysis = this.analyzeActivity(recentResults);

    var finalProbability = baseProbability;

    if (analysis.hasSignificantChange) {
      finalProbability += 0.3;
    }

    if (analysis.hasRepetition) {
      finalProbability -= 0.2;
    }

    if (analysis.isInteresting) {
      finalProbability += 0.2;
    }

    console.log('[Agent Evaluator] Probability check - base:', baseProbability, 'final:', finalProbability);

    if (Math.random() > finalProbability) {
      console.log('[Agent Evaluator] Skipped by probability');
      return null;
    }

    console.log('[Agent Evaluator] Generating comment...');
    var comment = await this.generateComment(recentResults, analysis);

    if (comment) {
      this.lastCommentTime = now;
      if (this.chatContext) {
        this.chatContext.addAssistantMessage(comment);
      }
    }

    return comment;
  }

  analyzeActivity(results) {
    var lastFew = results.slice(-5);
    var descriptions = lastFew.map(function(r) { return r.description || ''; });

    var uniqueDescriptions = new Set(descriptions);
    var hasSignificantChange = uniqueDescriptions.size > 3;
    var hasRepetition = uniqueDescriptions.size === 1;

    var interestingKeywords = ['error', 'warning', 'code', 'meeting', 'chat', 'game', 'video', 'photo'];
    var isInteresting = descriptions.some(function(desc) {
      return interestingKeywords.some(function(keyword) {
        return desc.toLowerCase().includes(keyword);
      });
    });

    var allTags = results.flatMap(function(r) { return r.tags || []; });
    var tagCounts = {};
    allTags.forEach(function(tag) {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    });
    var dominantThemes = Object.entries(tagCounts)
      .sort(function(a, b) { return b[1] - a[1]; })
           .slice(0, 3)
      .map(function(entry) { return entry[0]; });

    return {
      hasSignificantChange: hasSignificantChange,
      hasRepetition: hasRepetition,
      isInteresting: isInteresting,
      dominantThemes: dominantThemes,
      activityLevel: results.length
    };
  }

  async generateComment(results, analysis) {
    console.log('[Agent Evaluator] Generating comment - API Key exists:', !!apiKey, 'Mode:', textMode, 'Model:', textModel);

    if (!apiKey) {
      console.log('[Agent Evaluator] No API key, using template comment');
      return this.getTemplateComment(analysis);
    }

    // 获取最近的评论，避免重复
    var recentComments = this.chatContext
      ? this.chatContext.getLastN(10).filter(function(m) { return m.role === 'assistant'; }).map(function(m) { return m.content; })
      : [];

    try {
      if (textMode === 'anthropic') {
        return await this.generateAnthropic(results, recentComments);
      } else {
        return await this.generateOpenAI(results, recentComments);
      }
    } catch (error) {
      console.error('[Agent Evaluator] Error generating comment:', error.message);
      return this.getTemplateComment(analysis);
    }
  }

  async generateAnthropic(results, recentComments) {
    if (!anthropicClient) anthropicClient = new Anthropic({ apiKey: apiKey });

    var context = this.buildContext(results);
    var language = this.store.get('language') || 'zh';

    var recentCommentsText = recentComments.length > 0
      ? '\n\n最近说过的话（不要重复类似内容）:\n' + recentComments.map(function(c, i) { return (i+1) + '. ' + c.substring(0, 50); }).join('\n')
      : '';

    var langInstruction = language === 'zh'
      ? '请用中文回复，生成一句简短友好的评论（1-2句话）。注意：不要重复或相似于最近说过的话，要说点新鲜的内容。'
      : 'Generate a short, friendly comment (1-2 sentences) in English. Note: Do not repeat or be similar to recent comments, say something fresh.';

    var response = await anthropicClient.messages.create({
      model: textModel,
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: 'You are a friendly desktop pet. Context:\n' + context + recentCommentsText + '\n' + langInstruction
      }]
    });

    return response.content[0].text.trim();
  }

  async generateOpenAI(results, recentComments) {
    if (!openaiClient) {
      var config = { apiKey: apiKey };
      if (textBaseUrl) {
        config.baseURL = textBaseUrl;
      }
      openaiClient = new OpenAI(config);
      console.log('[Agent Evaluator] Created OpenAI client with BaseURL:', textBaseUrl || 'default');
    }

    var context = this.buildContext(results);
    var language = this.store.get('language') || 'zh';

    var recentCommentsText = recentComments.length > 0
      ? '\n\n最近说过的话（不要重复类似内容）:\n' + recentComments.map(function(c, i) { return (i+1) + '. ' + c.substring(0, 50); }).join('\n')
      : '';

    var langInstruction = language === 'zh'
      ? '请用中文回复，生成一句简短友好的评论（1-2句话）。注意：不要重复或相似于最近说过的话，要说点新鲜的内容。'
      : 'Generate a short, friendly comment (1-2 sentences) in English. Note: Do not repeat or be similar to recent comments, say something fresh.';

    console.log('[Agent Evaluator] Calling API - Context length:', context.length);

    var response = await openaiClient.chat.completions.create({
      model: textModel,
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: 'You are a friendly desktop pet. Context:\n' + context + recentCommentsText + '\n' + langInstruction
      }]
    });

    var comment = response.choices[0].message.content.trim();
    console.log('[Agent Evaluator] Generated comment:', comment.substring(0, 50) + '...');
    return comment;
  }

  buildContext(results) {
    var recent = results.slice(-10);
    return recent.map(function(r, i) {
      var timeAgo = results.length - i;
      return timeAgo + ' cycles ago: ' + (r.summary || r.description.substring(0, 100) || 'Unknown');
    }).join('\n');
  }

  getTemplateComment(analysis) {
    var language = this.store.get('language') || 'zh';

    var templates = language === 'zh' ? {
      high: [
        '哇，你今天好忙啊！看起来很高效！',
        '我看到很多活动！干得漂亮！',
        '你屏幕上显示的内容很有趣！'
      ],
      medium: [
        '看你工作得真认真！',
        '看起来不错！',
        '我一直在看着你的进展！'
      ],
      low: [
        '今天比较清闲？',
        '在休息吗？',
        '我只是在这里陪着你！'
      ]
    } : {
      high: [
        'Wow, you are really busy! Looking productive!',
        'I see lots of activity! Great work!',
        'Interesting stuff on your screen!'
      ],
      medium: [
        'Nice to see you working away!',
        'Looking good!',
        'I am here watching your progress!'
      ],
      low: [
        'Quiet day?',
        'Taking it easy?',
        'I am just here keeping you company!'
      ]
    };

    var level = this.store.get('enthusiasmLevel');
    var category = level >= 7 ? 'high' : level >= 4 ? 'medium' : 'low';

    if (analysis.isInteresting) {
      category = 'high';
    }

    var options = templates[category];
    return options[Math.floor(Math.random() * options.length)];
  }

  async forceComment() {
    var recentResults = this.visionQueue.getLatestResults(20);
    var language = this.store.get('language') || 'zh';

    if (recentResults.length === 0) {
      return language === 'zh' ? '我还没有看到任何东西！' : 'I have not seen anything yet!';
    }

    var analysis = this.analyzeActivity(recentResults);
    return await this.generateComment(recentResults, analysis);
  }

  async chat(userMessage) {
    if (!apiKey) {
      return this.getTemplateComment({});
    }

    try {
      // 获取最近的截图上下文
      var recentScreenshots = this.screenshotContext
        ? this.screenshotContext.getLastN(5).map(function(item) {
            return item.summary || (item.description ? item.description.substring(0, 100) : '');
          })
        : [];

      // 获取聊天历史
      var chatHistory = this.chatContext
        ? this.chatContext.getConversationForLLM(10)
        : [];

      var language = this.store.get('language') || 'zh';
      var systemPrompt = language === 'zh'
        ? '你是一个友好的桌面宠物猫咪。你会根据用户的屏幕内容和对话历史来回复。请用简短的中文回复（1-3句话）。'
        : 'You are a friendly desktop pet cat. You respond based on the user screen content and conversation history. Keep your response short (1-3 sentences) in English.';

      var contextText = '';
      if (recentScreenshots.length > 0) {
        contextText += '\n\n最近屏幕内容:\n' + recentScreenshots.map(function(s, i) {
          return (i + 1) + '. ' + s;
        }).join('\n');
      }

      var messages = [
        { role: 'system', content: systemPrompt + contextText }
      ];

      // 添加聊天历史
      chatHistory.forEach(function(msg) {
        messages.push(msg);
      });

      // 添加当前用户消息
      messages.push({ role: 'user', content: userMessage });

      console.log('[Agent Evaluator] Chat - Messages count:', messages.length);

      if (textMode === 'anthropic') {
        return await this.chatAnthropic(messages);
      } else {
        return await this.chatOpenAI(messages);
      }
    } catch (error) {
      console.error('[Agent Evaluator] Chat error:', error.message);
      return language === 'zh' ? '抱歉，出了点问题...' : 'Sorry, something went wrong...';
    }
  }

  async chatOpenAI(messages) {
    if (!openaiClient) {
      var config = { apiKey: apiKey };
      if (textBaseUrl) {
        config.baseURL = textBaseUrl;
      }
      openaiClient = new OpenAI(config);
    }

    var response = await openaiClient.chat.completions.create({
      model: textModel,
      max_tokens: 200,
      messages: messages
    });

    return response.choices[0].message.content.trim();
  }

  async chatAnthropic(messages) {
    if (!anthropicClient) anthropicClient = new Anthropic({ apiKey: apiKey });

    // 转换消息格式
    var systemMessage = messages.find(function(m) { return m.role === 'system'; });
    var otherMessages = messages.filter(function(m) { return m.role !== 'system'; });

    var response = await anthropicClient.messages.create({
      model: textModel,
      max_tokens: 200,
      system: systemMessage ? systemMessage.content : '',
      messages: otherMessages
    });

    return response.content[0].text.trim();
  }
}

module.exports = { AgentEvaluator };
