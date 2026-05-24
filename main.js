const { app, BrowserWindow, ipcMain, desktopCapturer, Menu, Tray, nativeImage, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const Store = require('electron-store');

// 数据存储在项目目录下的 data 文件夹
const dataDir = path.join(__dirname, 'data');

// 确保数据目录存在
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const store = new Store({
  cwd: dataDir,
  name: 'config',
  defaults: {
    language: 'zh',
    // Vision model settings
    visionMode: 'openai',
    visionBaseUrl: '',
    visionModel: '',
    visionApiKey: '',
    // Text model settings
    textMode: 'openai',
    textBaseUrl: '',
    textModel: '',
    textApiKey: '',
    // Other settings
    enthusiasmLevel: 5,
    commentsEnabled: true,
    screenshotInterval: 10000,
    petPosition: { x: 100, y: 100 },
    // Image compression
    compressImage: true,
    imageQuality: 0.7
  }
});

let mainWindow = null;
let settingsWindow = null;
let chatWindow = null;
let tray = null;
let screenshotInterval = null;
let agentInterval = null;
let totalScreenshots = 0;

const { ScreenshotCapturer } = require('./src/screenshot/capturer');
const { VisionQueue } = require('./src/vision/queue');
const { ScreenshotContext } = require('./src/memory/screenshot-context');
const { ChatContext } = require('./src/memory/chat-context');
const { AgentEvaluator } = require('./src/agent/evaluator');

let screenshotContext;
let chatContext;
let visionQueue;
let agentEvaluator;
let capturer;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 200,
    height: 250,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile('index.html');

  const position = store.get('petPosition');
  const display = screen.getPrimaryDisplay();
  const w = display.workAreaSize.width;
  const h = display.workAreaSize.height;

  mainWindow.setPosition(
    Math.min(position.x, w - 200),
    Math.min(position.y, h - 250)
  );

  mainWindow.on('moved', function() {
    var pos = mainWindow.getPosition();
    store.set('petPosition', { x: pos[0], y: pos[1] });
  });

  mainWindow.on('close', function(event) {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  createTray();
  initializeModules();
  startScreening();
}

function createSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 400,
    height: 650,
    resizable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  settingsWindow.loadFile('settings.html');
  settingsWindow.on('closed', function() {
    settingsWindow = null;
  });
}

function createChatWindow() {
  if (chatWindow && !chatWindow.isDestroyed()) {
    chatWindow.focus();
    return;
  }

  chatWindow = new BrowserWindow({
    width: 380,
    height: 550,
    resizable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  chatWindow.loadFile('chat.html');
  chatWindow.on('closed', function() {
    chatWindow = null;
  });
}

function createTray() {
  var iconPath = path.join(__dirname, 'assets', 'pet-icon.png');
  var icon;

  if (fs.existsSync(iconPath)) {
    icon = nativeImage.createFromPath(iconPath);
  } else {
    icon = nativeImage.createEmpty();
  }

  tray = new Tray(icon.isEmpty() ? nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAb0lEQVR4nGNgGLTg/38GBkYQZgJhJhBmA2FQCwYDYTYQZgNhNhBmA2E2EGYDYTYQZgNhNhBmA2E2EGYDYTYQZgNhNhBmA2E2EGYDYfwanwGDgTAbiMgLIDlAmA1E5AWQHCAMBqpyANW5ACQHCIOBihygKgdA5wBVNUCVDqA6BwjpAaIcoKoGqNIBVOcAqg9E5wBV5QBVNUDVDqA6B1B9ICQHiLIBABRGIxHxL3GJAAAAAElFTkSuQmCC') : icon);

  var contextMenu = Menu.buildFromTemplate([
    { label: 'Show Pet', click: function() { mainWindow.show(); } },
    { label: 'Settings', click: function() { createSettingsWindow(); } },
    { type: 'separator' },
    { label: 'Quit', click: function() { app.isQuitting = true; app.quit(); } }
  ]);

  tray.setToolTip('AI Desk Pet');
  tray.setContextMenu(contextMenu);
  tray.on('click', function() { mainWindow.show(); });
}

function initializeModules() {
  var contextDir = path.join(dataDir, 'context');

  screenshotContext = new ScreenshotContext(path.join(contextDir, 'screenshot'), 1000);
  chatContext = new ChatContext(path.join(contextDir, 'chat'), 1000);

  visionQueue = new VisionQueue();
  visionQueue.setMemoryManager(screenshotContext);

  // 初始化 worker 配置
  if (visionQueue.worker) {
    visionQueue.worker.updateConfig(
      store.get('visionMode'),
      store.get('visionBaseUrl'),
      store.get('visionModel'),
      store.get('visionApiKey')
    );
  }

  agentEvaluator = new AgentEvaluator(store, visionQueue, chatContext, screenshotContext);

  // 初始化 evaluator 配置
  agentEvaluator.updateConfig(
    store.get('textMode'),
    store.get('textBaseUrl'),
    store.get('textModel'),
    store.get('textApiKey')
  );

  global.mainWindow = mainWindow;

  startAgentLoop();

  console.log('[System] Modules initialized - Screenshot: ' + screenshotContext.size() + ', Chat: ' + chatContext.size());
}

function startAgentLoop() {
  if (agentInterval) clearInterval(agentInterval);

  agentInterval = setInterval(async function() {
    var comment = await agentEvaluator.evaluate();
    if (comment) {
      // 发送到主窗口显示
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('new-comment', comment);
      }
      // 发送到聊天窗口更新
      if (chatWindow && !chatWindow.isDestroyed()) {
        chatWindow.webContents.send('new-comment', comment);
      }
    }
  }, 30000);

  console.log('[System] Agent evaluation loop started');
}

function startScreening() {
  var interval = store.get('screenshotInterval');

  if (screenshotInterval) clearInterval(screenshotInterval);

  capturer = new ScreenshotCapturer(desktopCapturer, dataDir);

  screenshotInterval = setInterval(async function() {
    try {
      var screenshot = await capturer.capture();

      // 黑屏跳过
      if (screenshot.isBlackScreen) {
        return;
      }

      totalScreenshots++;

      visionQueue.add({
        id: 'img_' + totalScreenshots,
        path: screenshot.path,
        timestamp: Date.now()
      });

      if (totalScreenshots % 100 === 0 && totalScreenshots > 0) {
        console.log('[Checkpoint] ' + totalScreenshots + ' screenshots taken');
      }

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('screenshot-taken', {
          count: totalScreenshots,
          latestImage: screenshot.path
        });
      }
    } catch (error) {
      console.error('[Screenshot Error]', error);
    }
  }, interval);

  console.log('[System] Screenshot interval started: ' + interval + 'ms');
}

ipcMain.handle('get-settings', function() {
  return {
    language: store.get('language'),
    // Vision
    visionMode: store.get('visionMode'),
    visionBaseUrl: store.get('visionBaseUrl'),
    visionModel: store.get('visionModel'),
    visionApiKey: store.get('visionApiKey'),
    // Text
    textMode: store.get('textMode'),
    textBaseUrl: store.get('textBaseUrl'),
    textModel: store.get('textModel'),
    textApiKey: store.get('textApiKey'),
    // Other
    enthusiasmLevel: store.get('enthusiasmLevel'),
    commentsEnabled: store.get('commentsEnabled'),
    screenshotInterval: store.get('screenshotInterval'),
    // Image compression
    compressImage: store.get('compressImage'),
    imageQuality: store.get('imageQuality')
  };
});

ipcMain.handle('save-settings', function(event, settings) {
  if (settings.language !== undefined) store.set('language', settings.language);

  // Vision settings
  if (settings.visionMode !== undefined) store.set('visionMode', settings.visionMode);
  if (settings.visionBaseUrl !== undefined) store.set('visionBaseUrl', settings.visionBaseUrl);
  if (settings.visionModel !== undefined) store.set('visionModel', settings.visionModel);
  if (settings.visionApiKey !== undefined) store.set('visionApiKey', settings.visionApiKey);

  // Text settings
  if (settings.textMode !== undefined) store.set('textMode', settings.textMode);
  if (settings.textBaseUrl !== undefined) store.set('textBaseUrl', settings.textBaseUrl);
  if (settings.textModel !== undefined) store.set('textModel', settings.textModel);
  if (settings.textApiKey !== undefined) store.set('textApiKey', settings.textApiKey);

  // Other settings
  if (settings.enthusiasmLevel !== undefined) store.set('enthusiasmLevel', settings.enthusiasmLevel);
  if (settings.commentsEnabled !== undefined) store.set('commentsEnabled', settings.commentsEnabled);
  if (settings.screenshotInterval !== undefined) {
    store.set('screenshotInterval', settings.screenshotInterval);
    startScreening();
  }

  // Image compression settings
  if (settings.compressImage !== undefined) store.set('compressImage', settings.compressImage);
  if (settings.imageQuality !== undefined) store.set('imageQuality', settings.imageQuality);

  // Update workers
  if (visionQueue && visionQueue.worker) {
    visionQueue.worker.updateConfig(
      store.get('visionMode'),
      store.get('visionBaseUrl'),
      store.get('visionModel'),
      store.get('visionApiKey'),
      store.get('compressImage'),
      store.get('imageQuality')
    );
  }
  if (agentEvaluator) {
    agentEvaluator.updateConfig(
      store.get('textMode'),
      store.get('textBaseUrl'),
      store.get('textModel'),
      store.get('textApiKey')
    );
  }

  return true;
});

ipcMain.handle('open-settings-window', function() {
  createSettingsWindow();
});

ipcMain.handle('open-chat-window', function() {
  createChatWindow();
});

ipcMain.handle('get-memory-stats', function() {
  return {
    activeCount: screenshotContext.size(),
    totalScreenshots: totalScreenshots,
    archiveCount: screenshotContext.getArchiveCount(),
    chatCount: chatContext.size(),
    chatArchiveCount: chatContext.getArchiveCount()
  };
});

ipcMain.handle('clear-memory', function() {
  screenshotContext.clear();
  chatContext.clear();
  totalScreenshots = 0;
  return true;
});

ipcMain.handle('get-context', function() { return screenshotContext.getAll(); });
ipcMain.handle('get-chat-context', function() { return chatContext.getAll(); });
ipcMain.handle('get-latest-vision', function() { return visionQueue.getLatestResults(10); });

ipcMain.handle('chat', async function(event, message) {
  if (!chatContext || !agentEvaluator) {
    return 'System not ready';
  }

  // 记录用户消息
  chatContext.addUserMessage(message);

  // 生成回复
  var response = await agentEvaluator.chat(message);

  // 记录助手回复
  chatContext.addAssistantMessage(response);

  return response;
});

app.whenReady().then(createWindow);

app.on('window-all-closed', function() {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', function() {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('before-quit', function() {
  app.isQuitting = true;
  if (screenshotInterval) clearInterval(screenshotInterval);
  if (agentInterval) clearInterval(agentInterval);
});
