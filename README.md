# AI Desk Pet 🐱

一个具有截图监控和 AI 图像识别功能的 Electron 桌面宠物应用。

## 功能特性

- **定时截图**: 每5秒自动截屏一次
- **图像识别**: Claude Vision API 分析截图内容
- **智能记忆**:
  - 保留最近1000张图像识别结果
  - 每500张触发异步压缩
  - 第1000张时压缩替换前500张
  - 第2000张时存入冷记忆
- **AI 评论**: Agent 自动判断是否评论
- **可配置**: 用户可设置评论积极性 (1-10)

## 快速开始

### 1. 安装依赖

```bash
cd ai-desk-pet
npm install
```

### 2. 配置 API Key

复制 `.env.example` 为 `.env` 并填入你的 Claude API Key：

```bash
cp .env.example .env
```

然后编辑 `.env` 文件：
```
ANTHROPIC_API_KEY=sk-ant-your-api-key-here
```

**注意**: 没有 API Key 时应用会使用模拟数据进行测试。

### 3. 启动应用

```bash
npm start
```

## 使用说明

### 宠物窗口
- 拖拽移动宠物位置
- 右键点击系统托盘图标可以显示/隐藏宠物或退出

### 设置面板
点击 ⚙️ 按钮打开设置：
- **Enable Comments**: 开启/关闭 AI 评论
- **Comment Enthusiasm**: 评论积极性滑块 (1-10)
  - 高数值 = 更多评论、更积极
  - 低数值 = 更少评论
- **Screenshot Interval**: 截图间隔 (3-30秒)
- **Clear Memory**: 清空所有记忆

## 架构说明

```
├── main.js                 # Electron 主进程
├── preload.js              # 预加载脚本
├── src/
│   ├── screenshot/         # 截图模块
│   │   └── capturer.js     # 定时截图
│   ├── vision/             # 图像识别模块
│   │   ├── queue.js        # 识别队列管理
│   │   └── worker.js       # 识别 Worker
│   ├── memory/             # 记忆管理
│   │   ├── context.js      # 活跃上下文
│   │   ├── compression.js  # 异步压缩
│   │   └── cold.js         # 冷记忆存储
│   └── agent/              # Agent 评估
│       └── evaluator.js    # 评论决策
```

## 记忆机制

| 数量 | 触发事件 |
|------|----------|
| 500 | 日志 checkpoint |
| 1000 | 压缩前500条，替换详细描述为摘要 |
| 2000 | 前1000条存入冷记忆，重置计数 |

## 技术栈

- **框架**: Electron 28
- **AI**: Claude Vision API
- **存储**: electron-store
