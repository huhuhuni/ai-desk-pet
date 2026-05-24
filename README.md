# AI Desk Pet

一个能"看懂"你屏幕的 AI 桌面宠物。它会定时截图、识别屏幕内容，并结合上下文主动和你聊天。

## 功能特性

- **屏幕监控**: 定时截图并识别屏幕内容（支持黑屏/熄屏自动跳过）
- **AI 评论**: 宠物根据你正在做的事主动发表评论，不会重复说类似的话
- **聊天对话**: 点击聊天按钮打开对话窗口，和宠物自由交流
- **多模型支持**: 视觉模型和文本模型可分别配置，支持 OpenAI / Anthropic / 兼容 API
- **图片压缩**: 可开启截图压缩，降低 API 调用成本
- **中英双语**: 根据语言设置，宠物会说中文或英文
- **持久化存储**: 所有数据保存在本地 `data/` 目录，重启不丢失

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 启动应用

```bash
npm start
```

首次启动无需配置，应用会使用模拟数据运行。点击 ⚙️ 按钮打开设置面板配置 API Key 后即可启用真实识别。

## 配置说明

点击 ⚙️ 按钮打开设置面板：

### 视觉模型（截图识别）

| 配置项 | 说明 |
|--------|------|
| Mode | OpenAI 兼容 / Anthropic |
| Base URL | API 地址（留空使用默认） |
| Model | 模型名称，如 `gpt-4o`、`doubao-seed-1-8-251228` |
| API Key | 你的 API 密钥 |

### 文本模型（评论 & 聊天）

| 配置项 | 说明 |
|--------|------|
| Mode | OpenAI 兼容 / Anthropic |
| Base URL | API 地址（留空使用默认） |
| Model | 模型名称 |
| API Key | 你的 API 密钥 |

### 其他设置

| 配置项 | 说明 |
|--------|------|
| Language | 中文 / English |
| Enable Comments | 开启/关闭宠物主动评论 |
| Enthusiasm | 评论积极性 (1-10)，越高评论越频繁 |
| Screenshot Interval | 截图间隔（默认 10 秒） |
| Compress Image | 开启图片压缩 |
| Image Quality | 压缩质量 (30%-100%) |

## 项目结构

```
├── main.js                  # Electron 主进程
├── preload.js               # 预加载脚本（IPC 桥接）
├── index.html               # 宠物主窗口
├── chat.html                # 聊天窗口
├── settings.html            # 设置窗口
├── assets/                  # 图标资源
├── src/
│   ├── screenshot/
│   │   └── capturer.js      # 截图 + 黑屏检测
│   ├── vision/
│   │   ├── queue.js         # 识别队列（防积压）
│   │   └── worker.js        # API 调用 + 图片压缩
│   ├── memory/
│   │   ├── base-context.js  # 持久化上下文基类
│   │   ├── screenshot-context.js  # 截图上下文
│   │   └── chat-context.js  # 聊天上下文
│   └── agent/
│       └── evaluator.js     # 评论生成 & 聊天回复
└── data/                    # 本地数据（git 忽略）
    ├── config.json          # 应用配置
    └── context/
        ├── screenshot/      # 截图识别上下文 + 归档
        └── chat/            # 聊天记录上下文 + 归档
```

## 技术栈

- **框架**: Electron 28
- **视觉模型**: OpenAI API / Anthropic API（支持兼容端点，如火山引擎）
- **文本模型**: OpenAI API / Anthropic API
- **存储**: electron-store + 文件持久化
- **图片处理**: Electron nativeImage 压缩

## License

MIT
