
---
title: LoRA Caption Assistant
emoji: 🖼️
colorFrom: gray
colorTo: indigo
sdk: docker
app_port: 7860
---

> **原项目**: [Hugging Face - comfyuiman/loracaptionertaz](https://huggingface.co/spaces/comfyuiman/loracaptionertaz)
> **本项目**: 仅对原项目进行了中文汉化。

# LoRA Caption Assistant

一款 AI 驱动的网页应用，用于为图像和视频数据集生成高质量、详细的字幕描述。该工具专为训练 LoRA（Low-Rank Adaptation）模型而设计，支持 Google Gemini API、本地 Qwen 模型（通过 vLLM）、xAI Grok 和 OpenRouter 等多种 API 提供商，实现字幕生成自动化。

## 功能特性

*   **自动字幕生成**：使用 Gemini、Grok、OpenRouter 或本地 Qwen-VL 生成详细、客观的描述。
*   **LoRA 优化**：自动插入触发词，生成风格无关的描述。
*   **多模态支持**：同时支持图像和视频输入。
*   **角色标签**：可选的角色自动识别和标签功能。
*   **质量检查**：AI 驱动的评分系统，评估字幕质量（1-5 分）。
*   **批量处理**：支持请求队列和并发控制，防止速率限制或内存不足。
*   **数据集导出**：将数据集（媒体文件 + 文本文件）打包为 ZIP 下载。

---

## 🚀 部署到 Hugging Face Spaces

如果你没有 GPU，这是推荐的方式。

### 步骤 1：创建一个 Space
1.  前往 [Hugging Face Spaces](https://huggingface.co/spaces)。
2.  点击 **Create new Space**。
3.  输入名称（例如 `lora-caption-assistant`）。
4.  SDK 选择 **Docker**。
5.  选择 "Blank" 或 "Public" 模板。
6.  点击 **Create Space**。

### 步骤 2：上传文件
将本仓库的内容上传到你的 Space。确保以下文件位于 **根** 目录：
*   `Dockerfile`（关键：没有它应用将无法运行）
*   `package.json`
*   `vite.config.ts`
*   `index.html`
*   `src/` 文件夹（包含 `App.tsx` 等）

### 步骤 3：配置 API 密钥（适用于 Gemini）
1.  在你的 Space 中，进入 **Settings**。
2.  滚动到 **Variables and secrets**。
3.  点击 **New secret**。
4.  **Name**：`GEMINI_API_KEY`
5.  **Value**：你的 Google Gemini API 密钥。

---

## 🦙 本地 llama.cpp 方案（推荐，一键启动）

使用 llama.cpp 运行量化版 Huihui-Qwen3-VL-8B，比 vLLM 更轻量，无需 Python 环境，显存占用更低。

### 步骤 1：下载模型
从 Hugging Face 下载 GGUF 格式的模型文件：
> **模型地址**: [huihui-ai/Huihui-Qwen3-VL-8B-Instruct-abliterated](https://huggingface.co/huihui-ai/Huihui-Qwen3-VL-8B-Instruct-abliterated)

所需文件：
*   `Huihui-Qwen3-VL-8B-Instruct-abliterated.Q5_K_M.gguf`（模型权重）
*   `Huihui-Qwen3-VL-8B-Instruct-abliterated.mmproj-Q8_0.gguf`（多模态投影器）

### 步骤 2：配置路径
编辑 `start_huihui_qwen.bat`，修改以下路径：
*   `llama-server.exe` 的路径（需下载 [llama.cpp Windows 版](https://github.com/ggerganov/llama.cpp/releases)）
*   模型 `.gguf` 和 `.mmproj` 文件的存放路径

### 步骤 3：一键启动
双击运行 `start_huihui_qwen.bat`，脚本将自动：
1.  在端口 **8001** 启动 llama-server（OpenAI 兼容 API）
2.  在端口 **7860** 启动前端

### 步骤 4：连接前端
打开浏览器访问 `http://localhost:7860`：
*   AI 提供商选择：**本地 Qwen (GPU)**
*   端点 URL 填写：`http://localhost:8001/v1`

---

## 🤖 本地 Qwen 设置指南（vLLM 方案）

如果你有性能强劲的 NVIDIA GPU（建议 12GB+ 显存），也可以通过 vLLM 运行模型。

### 环境要求
*   **操作系统**：Windows 或 Linux
*   **GPU**：NVIDIA GPU（支持 CUDA）
*   **软件**：已安装 Python 3.10+ 和 CUDA Toolkit

### 步骤 1：获取安装脚本
1.  打开 LoRA Caption Assistant 网页应用。
2.  在 **AI 提供商** 下选择 **本地 Qwen (GPU)**。
3.  选择你想要的模型（例如 `Qwen 2.5 VL 7B`）。
4.  设置你想要的安装路径。
5.  点击 **下载安装脚本**。

### 步骤 2：运行服务
1.  找到下载的 `.bat`（Windows）或 `.sh`（Linux）文件。
2.  运行它。
3.  脚本将执行以下操作：
    *   创建 Python 虚拟环境。
    *   安装 `vllm`。
    *   从 Hugging Face 下载选定的 Qwen 模型。
    *   在端口 8000 上启动兼容 OpenAI 的 API 服务。

### 步骤 3：连接到应用

**场景 A：在本地运行应用（localhost）**
*   如果你在本地计算机上运行此网页应用（`npm run dev`），只需在应用中将端点设置为：`http://localhost:8000/v1`

**场景 B：在 Hugging Face 上运行应用（HTTPS）**
*   如果你通过 Hugging Face Spaces 访问网页应用，由于浏览器安全策略（混合内容阻止），你**无法**直接连接到 `localhost`。
*   你必须创建一个安全隧道。

**如何创建隧道：**
1.  **Cloudflare 隧道（最简单）**：
    *   下载 `cloudflared`。
    *   运行：`cloudflared tunnel --url http://localhost:8000`
    *   复制以 `.trycloudflare.com` 结尾的 URL。
2.  **粘贴 URL**：
    *   将此安全 URL 粘贴到网页应用中的 **端点 URL** 字段。
    *   在末尾添加 `/v1`（例如 `https://example.trycloudflare.com/v1`）。

---

## 💻 本地开发（网页应用）

### 环境要求
*   Node.js（v18+）
*   npm

### 安装步骤
1.  克隆仓库：
    ```bash
    git clone <your-repo-url>
    cd lora-caption-assistant
    ```

2.  安装依赖：
    ```bash
    npm install
    ```

3.  运行应用：
    ```bash
    npm run dev
    ```
    在浏览器中打开 `http://localhost:5173`。

## 许可协议

MIT
