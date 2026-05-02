@echo off
chcp 65001 >nul
title Qwen3-VL-8B Huihui

echo ========================================
echo   Starting Huihui-Qwen3-VL-8B
echo ========================================
echo.

echo [1/2] Starting llama.cpp backend (Huihui-Qwen3-VL-8B Q5_K_M) on port 8001...
echo.
start "llama-huihui" "D:\down\2026_04\llama-b8837-bin-win-cuda-13.1-x64\llama-server.exe" ^
    --model "E:\111\lora\Huihui-Qwen3-VL-8B-GGUF\Huihui-Qwen3-VL-8B-Instruct-abliterated.Q5_K_M.gguf" ^
    --mmproj "E:\111\lora\Huihui-Qwen3-VL-8B-GGUF\Huihui-Qwen3-VL-8B-Instruct-abliterated.mmproj-Q8_0.gguf" ^
    --port 8001 --ctx-size 8192 --n-gpu-layers 99 --cache-ram 0 -np 1

:: Wait for backend to start loading
timeout /t 5 /nobreak >nul

:: Start frontend
echo [2/2] Starting frontend (Vite) on port 7860...
echo.
start "vite-frontend" cmd /c "cd /d "E:\111\lora\loracaptionertaz" && npm run dev"

echo.
echo ========================================
echo   Both services are starting up:
echo     Backend:   http://localhost:8001  (Huihui-Qwen3-VL-8B)
echo     Frontend:  http://localhost:7860
echo ========================================
echo.
echo   In the LoRA Caption Assistant UI:
echo     1. Select "Local Qwen (GPU)" as provider
echo     2. Set Endpoint to: http://localhost:8001/v1
echo ========================================
echo.
pause
