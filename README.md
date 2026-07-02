# AI 答题助手 (QSanswer)

一个运行在本地的 AI 网页答题工具，通过悬浮窗截图或自动检测题目，调用 DeepSeek V4 Pro 模型直接解题。

支持 Firefox / Edge，安装 Tampermonkey 脚本后，在任何网页上都能使用。

## 功能

- 📸 **截图答题**：Win+Shift+S 截图题目，Ctrl+V 粘贴到面板，AI 自动识别并解答
- 🔍 **自动检测**：抓取网页文本，自动找出题目并解答
- 💬 **连续追问**：答题后可继续追问，保持上下文
- 🧠 **三种推理模式**：普通 / 深度思考 / 极限推理
- 📋 **历史记录**：所有问答自动保存到本地文件
- 🎨 **蓝白主题**：悬浮窗，可拖拽，全屏模式下也能用

## 快速开始

### 1. 获取 API Key
注册 [DeepSeek](https://platform.deepseek.com/api_keys) 并创建 API Key。

### 2. 配置
在项目目录创建 `.env` 文件：
```
DEEPSEEK_API_KEY=sk-你的APIKey
```

### 3. 启动服务
双击 `start.bat`（Windows）或运行：
```bash
pip install -r requirements.txt
python server.py
```

### 4. 安装浏览器脚本
1. 安装 [Tampermonkey](https://www.tampermonkey.net/) 扩展
2. 新建脚本，粘贴 `tampermonkey_script.js` 全部内容
3. 打开任意网页，右下角出现蓝色悬浮球

## 技术栈

- Python 3.12 + Flask
- DeepSeek V4 Pro API（Vision + Reasoning）
- Tampermonkey（Shadow DOM）
- 纯 JavaScript（无框架依赖）

## 项目结构

```
QSanswer/
├── server.py              # Flask 服务
├── deepseek_client.py     # DeepSeek API 封装
├── tampermonkey_script.js # 浏览器悬浮窗脚本
├── panel.html             # 独立面板页面（备用）
├── requirements.txt       # Python 依赖
├── start.bat              # Windows 一键启动
├── history.json           # 答题历史记录
├── 使用教程.md             # 详细使用教程
└── .env                   # API Key 配置（不入库）
```

## License

MIT
