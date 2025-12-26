
---
title: LoRA Caption Assistant
emoji: 🖼️
colorFrom: gray
colorTo: indigo
sdk: docker
app_port: 7860
---

# LoRA Caption Assistant

An AI-powered web application designed to assist in generating high-quality, detailed captions for image and video datasets. This tool is specifically tailored for training LoRA (Low-Rank Adaptation) models, utilizing Google's Gemini API or a Local Qwen Model (via vLLM) to automate the captioning process.

## Features

*   **Automated Captioning**: Generates detailed, objective descriptions using Gemini 2.5 Pro or local Qwen-VL.
*   **LoRA Optimized**: Automatic trigger word insertion and style-agnostic descriptions.
*   **Multi-Modal**: Supports both image and video inputs.
*   **Character Tagging**: Optional automatic identification and tagging of specific characters.
*   **Quality Assurance**: AI-powered scoring system to evaluate caption quality (1-5 scale).
*   **Batch Processing**: Robust queue system with rate limiting (RPM) and batch sizes.
*   **Export**: Downloads the dataset (media + text files) as a ZIP file.

---

## 🚀 Deployment on Hugging Face Spaces

This is the recommended way to run the application if you don't have a GPU.

### Step 1: Create a Space
1.  Go to [Hugging Face Spaces](https://huggingface.co/spaces).
2.  Click **Create new Space**.
3.  Enter a name (e.g., `lora-caption-assistant`).
4.  Select **Docker** as the SDK.
5.  Choose "Blank" or "Public" template.
6.  Click **Create Space**.

### Step 2: Upload Files
Upload the contents of this repository to your Space. Ensure the following files are in the **root** directory:
*   `Dockerfile` (Critical: The app will fail without this)
*   `package.json`
*   `vite.config.ts`
*   `index.html`
*   `src/` folder (containing `App.tsx`, etc.)

### Step 3: Configure API Key (For Gemini)
1.  In your Space, go to **Settings**.
2.  Scroll to **Variables and secrets**.
3.  Click **New secret**.
4.  **Name**: `API_KEY`
5.  **Value**: Your Google Gemini API Key.

---

## 🤖 Local Qwen Setup Guide

If you have a powerful NVIDIA GPU (12GB+ VRAM recommended), you can run the captioning model **locally for free** and connect this web app to it.

### Prerequisites
*   **OS**: Windows or Linux
*   **GPU**: NVIDIA GPU (CUDA support)
*   **Software**: Python 3.10+ and CUDA Toolkit installed.

### Step 1: Get the Script
1.  Open the LoRA Caption Assistant Web App.
2.  Under **AI Provider**, select **Local Qwen (GPU)**.
3.  Select your desired model (e.g., `Qwen 2.5 VL 7B`).
4.  Set your desired install folder path.
5.  Click **Download Setup Script**.

### Step 2: Run the Server
1.  Locate the downloaded `.bat` (Windows) or `.sh` (Linux) file.
2.  Run it.
3.  The script will:
    *   Create a Python virtual environment.
    *   Install `vllm`.
    *   Download the selected Qwen model from Hugging Face.
    *   Start an OpenAI-compatible API server on port 8000.

### Step 3: Connect to the App

**Scenario A: Running App Locally (localhost)**
*   If you are running this web app on your own computer (`npm run dev`), simply set the Endpoint in the app to: `http://localhost:8000/v1`

**Scenario B: Running App on Hugging Face (HTTPS)**
*   If you are accessing the web app via Hugging Face Spaces, you **cannot** connect to `localhost` directly due to browser security (Mixed Content Blocking).
*   You must create a secure tunnel.

**How to Tunnel:**
1.  **Cloudflare Tunnel (Easiest)**:
    *   Download `cloudflared`.
    *   Run: `cloudflared tunnel --url http://localhost:8000`
    *   Copy the URL ending in `.trycloudflare.com`.
2.  **Paste the URL**:
    *   Paste this secure URL into the **Local Endpoint** field in the Web App.
    *   Add `/v1` to the end (e.g., `https://example.trycloudflare.com/v1`).

---

## 💻 Local Development (Web App)

### Prerequisites
*   Node.js (v18+)
*   npm

### Installation
1.  Clone the repo:
    ```bash
    git clone <your-repo-url>
    cd lora-caption-assistant
    ```

2.  Install dependencies:
    ```bash
    npm install
    ```

3.  Run the app:
    ```bash
    npm run dev
    ```
    Open `http://localhost:5173` in your browser.

## License

MIT
