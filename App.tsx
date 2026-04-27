
import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import type { MediaFile } from './types';
import { GenerationStatus } from './types';
import FileUploader from './components/FileUploader';
import MediaItem from './components/MediaItem';
import { generateCaption, refineCaption, checkCaptionQuality } from './services/geminiService';
import { generateCaptionQwen, refineCaptionQwen, checkQualityQwen } from './services/qwenService';
import { generateCaptionGrok, refineCaptionGrok, checkQualityGrok } from './services/grokService';
import { generateCaptionOpenRouter, refineCaptionOpenRouter, checkQualityOpenRouter } from './services/openRouterService';
import { sendComfyPrompt } from './services/comfyService';
import { DownloadIcon, SparklesIcon, WandIcon, LoaderIcon, CopyIcon, UploadCloudIcon, XIcon, CheckCircleIcon, AlertTriangleIcon, StopIcon, TrashIcon } from './components/Icons';
import { DEFAULT_COMFY_WORKFLOW } from './constants/defaultWorkflow';

declare const process: {
  env: { GEMINI_API_KEY?: string; [key: string]: string | undefined; }
};

declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }
  interface Window { JSZip: any; aistudio?: AIStudio; }
}

type ApiProvider = 'gemini' | 'qwen' | 'grok' | 'openrouter';
type OSType = 'windows' | 'linux';

const GEMINI_MODELS = [
    { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro (High Quality)' },
    { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash (Fast)' },
    { id: 'gemini-3.1-flash-lite-preview', name: 'Gemini 3.1 Flash Lite' },
    { id: 'gemini-3.1-flash-live-preview', name: 'Gemini 3.1 Flash Live (Native Audio/Video)' },
    { id: 'gemini-flash-latest', name: 'Gemini Flash Latest' }
];

const QWEN_MODELS = [
    { id: 'thesby/Qwen3-VL-8B-NSFW-Caption-V4.5', name: 'Thesby Qwen 3 VL 8B NSFW Caption V4.5' },
    { id: 'huihui-ai/Huihui-Qwen3-VL-8B-Instruct-abliterated', name: 'Huihui Qwen 3 VL 8B Abliterated (Uncensored)' },
    { id: 'Qwen/Qwen3-VL-8B-Instruct-FP8', name: 'Qwen 3 VL 8B FP8' },
];

const GROK_MODELS = [
    { id: 'grok-4-1-fast-reasoning', name: 'Grok 4-1 Fast Reasoning' },
    { id: 'grok-4-1-fast-non-reasoning', name: 'Grok 4-1 Fast Non-Reasoning' },
    { id: 'grok-4-fast-reasoning', name: 'Grok 4 Fast Reasoning' },
    { id: 'grok-4-fast-non-reasoning', name: 'Grok 4 Fast Non-Reasoning' },
    { id: 'grok-3-vision-preview', name: 'Grok 3 Vision (Latest Preview)' },
    { id: 'grok-2-vision-1212', name: 'Grok 2 Vision (12-12)' },
    { id: 'grok-2-vision', name: 'Grok 2 Vision (Alias)' },
    { id: 'grok-vision-beta', name: 'Grok Vision Beta' },
    { id: 'grok-imagine-video', name: 'Grok Imagine Video' }
];

const OPENROUTER_MODELS = [
    { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini' },
    { id: 'openai/gpt-4o', name: 'GPT-4o' },
    { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet' },
    { id: 'qwen/qwen-2-vl-72b-instruct', name: 'Qwen 2 VL 72B' },
    { id: 'qwen/qwen-2-vl-7b-instruct', name: 'Qwen 2 VL 7B' },
    { id: 'qwen/qwen3.5-35b-a3b-20260224', name: 'Qwen 3.5 35B (Reasoning)' },
];

const DEFAULT_BULK_INSTRUCTIONS = `Dont use ambiguous language "perhaps" for example. Describe EVERYTHING visible: characters, clothing, actions, background, objects, lighting, and camera angle. Refrain from using generic phrases like "character, male, figure of" and use specific terminology: "woman, girl, boy, man". Do not mention the art style.`;
const DEFAULT_REFINEMENT_INSTRUCTIONS = `Refine the caption to be more descriptive and cinematic. Ensure all colors and materials are mentioned.`;

const App: React.FC = () => {
  // --- STATE ---
  const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([]);
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
  const [triggerWord, setTriggerWord] = useState<string>('MyStyle');
  const [apiProvider, setApiProvider] = useState<ApiProvider>('gemini');
  const [geminiApiKey, setGeminiApiKey] = useState<string>(process.env.GEMINI_API_KEY || '');
  const [geminiModel, setGeminiModel] = useState<string>(GEMINI_MODELS[0].id);

  // xAI Grok Options
  const [grokApiKey, setGrokApiKey] = useState<string>('');
  const [grokModel, setGrokModel] = useState<string>(GROK_MODELS[0].id);

  // OpenRouter Options
  const [openRouterApiKey, setOpenRouterApiKey] = useState<string>('');
  const [openRouterModel, setOpenRouterModel] = useState<string>(OPENROUTER_MODELS[0].id);
  const [openRouterMaxTokens, setOpenRouterMaxTokens] = useState<number>(4096);
  const [openRouterTemperature, setOpenRouterTemperature] = useState<number>(0.7);
  const [openRouterUseFullVideo, setOpenRouterUseFullVideo] = useState<boolean>(false);

  // Qwen Options
  const [qwenEndpoint, setQwenEndpoint] = useState<string>('');
  const [useCustomQwenModel, setUseCustomQwenModel] = useState<boolean>(false);
  const [customQwenModelId, setCustomQwenModelId] = useState<string>('');
  const [qwenModel, setQwenModel] = useState<string>(QWEN_MODELS[0].id);
  const [qwenOsType, setQwenOsType] = useState<OSType>(() => navigator.userAgent.includes("Windows") ? 'windows' : 'linux');
  const [qwenInstallDir, setQwenInstallDir] = useState<string>(() => navigator.userAgent.includes("Windows") ? 'C:\\AI\\qwen_local' : '/home/user/ai/qwen_local');
  const [qwenMaxTokens, setQwenMaxTokens] = useState<number>(8192);
  const [qwen8Bit, setQwen8Bit] = useState<boolean>(false);
  const [qwenEager, setQwenEager] = useState<boolean>(false);
  const [qwenVideoFrameCount] = useState<number>(8);
  
  // Offline Local Snapshot Options
  const [useOfflineSnapshot, setUseOfflineSnapshot] = useState<boolean>(false);
  const [snapshotPath, setSnapshotPath] = useState<string>('');
  const [virtualModelName, setVirtualModelName] = useState<string>('thesby/Qwen3-VL-8B-NSFW-Caption-V4.5');

  // ComfyUI Options
  const [isComfyEnabled, setIsComfyEnabled] = useState<boolean>(false);
  const [comfyUrl, setComfyUrl] = useState<string>('http://localhost:5000');
  const [comfyWorkflow, setComfyWorkflow] = useState<any>(DEFAULT_COMFY_WORKFLOW);
  const [comfyWorkflowName, setComfyWorkflowName] = useState<string>('Default Workflow');
  const [comfySeed, setComfySeed] = useState<number>(-1);
  const [comfySteps, setComfySteps] = useState<number>(4);
  const [activePreviewId, setActivePreviewId] = useState<string | null>(null);

  // Secure Bridge Options
  const [useSecureBridge, setUseSecureBridge] = useState<boolean>(false);
  const [isFirstTimeBridge, setIsFirstTimeBridge] = useState<boolean>(false);
  const [bridgeOsType, setBridgeOsType] = useState<OSType>(() => navigator.userAgent.includes("Windows") ? 'windows' : 'linux');
  const [bridgeInstallPath, setBridgeInstallPath] = useState<string>(() => navigator.userAgent.includes("Windows") ? 'C:\\AI\\bridge' : '/home/user/ai/bridge');

  // Queue and Performance
  const [useRequestQueue, setUseRequestQueue] = useState<boolean>(true);
  const [concurrentTasks, setConcurrentTasks] = useState<number>(1);
  const [isQueueRunning, setIsQueueRunning] = useState<boolean>(false);

  // Dataset / Instructions
  const [bulkGenerationInstructions, setBulkGenerationInstructions] = useState<string>(DEFAULT_BULK_INSTRUCTIONS);
  const [bulkRefinementInstructions, setBulkRefinementInstructions] = useState<string>(DEFAULT_REFINEMENT_INSTRUCTIONS);
  const [autofitTextareas, setAutofitTextareas] = useState<boolean>(false);
  const [showSideBySidePreview, setShowSideBySidePreview] = useState<boolean>(false);
  const [datasetPrefix, setDatasetPrefix] = useState<string>('item');
  const [isCharacterTaggingEnabled, setIsCharacterTaggingEnabled] = useState<boolean>(false);
  const [characterShowName, setCharacterShowName] = useState<string>('');
  const [isExporting, setIsExporting] = useState<boolean>(false);

  const abortControllerRef = useRef<AbortController>(new AbortController());

  // --- EFFECTS ---
  useEffect(() => {
    const isHttps = window.location.protocol === 'https:';
    if (!qwenEndpoint) {
        setQwenEndpoint(isHttps ? '' : 'http://localhost:8000/v1');
    }
  }, [qwenEndpoint]);

  // Handle Modal Keyboard Navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!activePreviewId) return;
      if (e.key === 'ArrowRight') handleNextPreview();
      if (e.key === 'ArrowLeft') handlePrevPreview();
      if (e.key === 'Escape') setActivePreviewId(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activePreviewId, mediaFiles]);

  // --- MEMOIZED VALUES ---
  const hasValidConfig = useMemo(() => {
    if (apiProvider === 'gemini') return !!geminiApiKey;
    if (apiProvider === 'grok') return !!grokApiKey;
    if (apiProvider === 'openrouter') return !!openRouterApiKey;
    return qwenEndpoint !== '';
  }, [apiProvider, geminiApiKey, grokApiKey, openRouterApiKey, qwenEndpoint]);

  const selectedFiles = useMemo(() => {
    return (mediaFiles || []).filter(mf => mf.isSelected);
  }, [mediaFiles]);
  const currentPreviewItem = useMemo(() => (mediaFiles || []).find(m => m.id === activePreviewId), [mediaFiles, activePreviewId]);

  const qwenEffectiveModel = useMemo(() => {
    if (useOfflineSnapshot) return virtualModelName;
    return useCustomQwenModel ? customQwenModelId : qwenModel;
  }, [useOfflineSnapshot, virtualModelName, useCustomQwenModel, customQwenModelId, qwenModel]);

  const qwenStartCommand = useMemo(() => {
    const isWin = qwenOsType === 'windows';
    const path = qwenInstallDir.replace(/[\\/]+$/, '');
    
    // Model logic for command
    const modelToLoad = useOfflineSnapshot ? snapshotPath : (useCustomQwenModel ? customQwenModelId : qwenModel);
    
    const activate = isWin ? `venv\\Scripts\\activate` : `source venv/bin/activate`;
    const python = isWin ? `python` : `python3`;
    const offlineEnv = isWin ? `set HF_HUB_OFFLINE=1` : `export HF_HUB_OFFLINE=1`;
    
    let args = `--model "${modelToLoad}" --max-model-len ${qwenMaxTokens}`;
    if (useOfflineSnapshot) {
      args += ` --served-model-name "${virtualModelName}"`;
    }
    if (qwen8Bit) args += ` --load-format bitsandbytes --quantization bitsandbytes`;
    if (qwenEager) args += ` --enforce-eager`;
    
    const baseCmd = isWin 
      ? `cd /d "${path}" && ${useOfflineSnapshot ? `${offlineEnv} && ` : ''}${activate} && ${python} -m vllm.entrypoints.openai.api_server ${args}`
      : `cd "${path}" && ${useOfflineSnapshot ? `${offlineEnv} && ` : ''}${activate} && ${python} -m vllm.entrypoints.openai.api_server ${args}`;
    
    return baseCmd;
  }, [qwenOsType, qwenInstallDir, useCustomQwenModel, customQwenModelId, qwenModel, qwenMaxTokens, qwen8Bit, qwenEager, useOfflineSnapshot, snapshotPath, virtualModelName]);

  const bridgeStartCommand = useMemo(() => {
    const isWindows = bridgeOsType === 'windows';
    const path = bridgeInstallPath.replace(/[\\/]+$/, '');
    const activateCmd = isWindows ? `call venv\\Scripts\\activate` : `source venv/bin/activate`;
    const pipCmd = `pip install flask flask-cors requests`;
    const setupCmd = isWindows 
      ? `python -m venv venv && ${activateCmd} && ${pipCmd}`
      : `python3 -m venv venv && ${activateCmd} && ${pipCmd}`;
    return isWindows 
        ? `cd /d "${path}" && ${isFirstTimeBridge ? `${setupCmd} && ` : ''}${activateCmd} && python bridge.py`
        : `cd "${path}" && ${isFirstTimeBridge ? `${setupCmd} && ` : ''}${activateCmd} && python3 bridge.py`;
  }, [bridgeInstallPath, bridgeOsType, isFirstTimeBridge]);

  // --- HANDLERS ---
  const updateFile = useCallback((id: string, updates: Partial<MediaFile>) => {
    setMediaFiles(prev => (prev || []).map(mf => (mf.id === id ? { ...mf, ...updates } : mf)));
  }, []);

  const handleFilesAdded = useCallback(async (files: File[]) => {
    const mediaFilesList = files.filter(file => file.type.startsWith('image/') || file.type.startsWith('video/'));
    const textFilesList = files.filter(file => file.name.toLowerCase().endsWith('.txt'));

    // Create a map of filename (no extension) to the text file object for quick lookup
    const textFilesMap = new Map<string, File>();
    textFilesList.forEach(f => {
      const baseName = f.name.substring(0, f.name.lastIndexOf('.'));
      textFilesMap.set(baseName.toLowerCase(), f);
    });

    const newMediaFiles = await Promise.all(mediaFilesList.map(async (file) => {
      const baseName = file.name.substring(0, file.name.lastIndexOf('.'));
      let initialCaption = '';
      
      const matchedTxtFile = textFilesMap.get(baseName.toLowerCase());
      if (matchedTxtFile) {
        try {
          initialCaption = await matchedTxtFile.text();
        } catch (e) {
          console.error(`Failed to read caption for ${file.name}`, e);
        }
      }

      return {
        id: `${file.name}-${Math.random()}`,
        file,
        previewUrl: URL.createObjectURL(file),
        caption: initialCaption.trim(),
        status: GenerationStatus.IDLE,
        isSelected: false,
        customInstructions: '',
        comfyStatus: 'idle'
      } as MediaFile;
    }));

    setMediaFiles(prev => [...(prev || []), ...newMediaFiles]);
  }, []);

  const handleCheckQuality = useCallback(async (id: string) => {
    const fileToProcess = (mediaFiles || []).find(mf => mf.id === id);
    if (!hasValidConfig || !fileToProcess || !fileToProcess.caption) return;

    updateFile(id, { status: GenerationStatus.CHECKING, errorMessage: undefined });

    try {
        let score = 0;
        if (apiProvider === 'gemini') {
            score = await checkCaptionQuality(fileToProcess.file, fileToProcess.caption, abortControllerRef.current.signal, geminiApiKey, geminiModel);
        } else if (apiProvider === 'grok') {
            score = await checkQualityGrok(grokApiKey, grokModel, fileToProcess.file, fileToProcess.caption, qwenVideoFrameCount, abortControllerRef.current.signal);
        } else if (apiProvider === 'openrouter') {
            score = await checkQualityOpenRouter(openRouterApiKey, openRouterModel, fileToProcess.file, fileToProcess.caption, qwenVideoFrameCount, openRouterTemperature, openRouterUseFullVideo, abortControllerRef.current.signal);
        } else {
            score = await checkQualityQwen('', qwenEndpoint, qwenEffectiveModel, fileToProcess.file, fileToProcess.caption, qwenVideoFrameCount, abortControllerRef.current.signal);
        }
        
        updateFile(id, { qualityScore: score, status: GenerationStatus.SUCCESS });
    } catch (err: any) {
        if (err.name === 'AbortError' || err.message === 'AbortError') {
            updateFile(id, { status: GenerationStatus.IDLE, errorMessage: "Stopped by user" });
        } else {
            updateFile(id, { status: GenerationStatus.ERROR, errorMessage: err.message });
        }
    }
  }, [mediaFiles, apiProvider, qwenEndpoint, qwenEffectiveModel, qwenVideoFrameCount, grokApiKey, grokModel, openRouterApiKey, openRouterModel, hasValidConfig, updateFile, geminiApiKey, geminiModel]);

  const handleSelectionChange = useCallback((id: string, isSelected: boolean, shiftKey: boolean) => {
    setMediaFiles(prev => {
      const files = prev || [];
      const currentIndex = files.findIndex(f => f.id === id);
      if (currentIndex === -1) return files;

      if (shiftKey && lastSelectedIndex !== null) {
        const start = Math.min(lastSelectedIndex, currentIndex);
        const end = Math.max(lastSelectedIndex, currentIndex);
        return files.map((f, idx) => {
          if (idx >= start && idx <= end) {
            return { ...f, isSelected };
          }
          return f;
        });
      } else {
        return files.map(f => (f.id === id ? { ...f, isSelected } : f));
      }
    });
    setLastSelectedIndex(mediaFiles.findIndex(f => f.id === id));
  }, [mediaFiles, lastSelectedIndex]);

  const handleGenerateCaption = useCallback(async (id: string, itemInstructions?: string) => {
    const fileToProcess = (mediaFiles || []).find(mf => mf.id === id);
    if (!hasValidConfig || !fileToProcess) return;

    updateFile(id, { status: GenerationStatus.GENERATING, errorMessage: undefined, qualityScore: undefined });
    
    const combinedInstructions = `${bulkGenerationInstructions}\n\n${itemInstructions || ''}`.trim();

    try {
      let caption = '';
      if (apiProvider === 'gemini') {
          caption = await generateCaption(fileToProcess.file, triggerWord, combinedInstructions, isCharacterTaggingEnabled, characterShowName, abortControllerRef.current.signal, geminiApiKey, geminiModel);
      } else if (apiProvider === 'grok') {
          caption = await generateCaptionGrok(grokApiKey, grokModel, fileToProcess.file, triggerWord, combinedInstructions, isCharacterTaggingEnabled, characterShowName, qwenVideoFrameCount, abortControllerRef.current.signal);
      } else if (apiProvider === 'openrouter') {
          caption = await generateCaptionOpenRouter(openRouterApiKey, openRouterModel, fileToProcess.file, triggerWord, combinedInstructions, isCharacterTaggingEnabled, characterShowName, qwenVideoFrameCount, openRouterMaxTokens, openRouterTemperature, openRouterUseFullVideo, abortControllerRef.current.signal);
          console.log(`Caption received for ${id}:`, caption);
      } else {
          caption = await generateCaptionQwen('', qwenEndpoint, qwenEffectiveModel, fileToProcess.file, triggerWord, combinedInstructions, isCharacterTaggingEnabled, characterShowName, qwenVideoFrameCount, abortControllerRef.current.signal);
      }
      
      console.log(`Updating file ${id} to SUCCESS status`);
      updateFile(id, { caption, status: GenerationStatus.SUCCESS });
    } catch (err: any) {
      console.error(`Error in handleGenerateCaption for ${id}:`, err);
      if (err.name === 'AbortError' || err.message === 'AbortError') {
          updateFile(id, { status: GenerationStatus.IDLE, errorMessage: "Stopped by user" });
      } else {
          updateFile(id, { status: GenerationStatus.ERROR, errorMessage: err.message });
      }
    }
  }, [mediaFiles, triggerWord, apiProvider, qwenEndpoint, qwenEffectiveModel, qwenVideoFrameCount, grokApiKey, grokModel, openRouterApiKey, openRouterModel, openRouterMaxTokens, openRouterTemperature, openRouterUseFullVideo, bulkGenerationInstructions, isCharacterTaggingEnabled, characterShowName, hasValidConfig, updateFile, geminiApiKey, geminiModel]);

  const handleRefineCaptionItem = useCallback(async (id: string, itemInstructions?: string) => {
    const fileToProcess = (mediaFiles || []).find(mf => mf.id === id);
    if (!hasValidConfig || !fileToProcess || !fileToProcess.caption) return;

    updateFile(id, { status: GenerationStatus.GENERATING, errorMessage: undefined });
    
    const combinedInstructions = `${bulkRefinementInstructions}\n\n${itemInstructions || ''}`.trim();

    try {
      let caption = '';
      if (apiProvider === 'gemini') {
          caption = await refineCaption(fileToProcess.file, fileToProcess.caption, combinedInstructions, abortControllerRef.current.signal, geminiApiKey, geminiModel);
      } else if (apiProvider === 'grok') {
          caption = await refineCaptionGrok(grokApiKey, grokModel, fileToProcess.file, fileToProcess.caption, combinedInstructions, qwenVideoFrameCount, abortControllerRef.current.signal);
      } else if (apiProvider === 'openrouter') {
          caption = await refineCaptionOpenRouter(openRouterApiKey, openRouterModel, fileToProcess.file, fileToProcess.caption, combinedInstructions, qwenVideoFrameCount, openRouterMaxTokens, openRouterTemperature, openRouterUseFullVideo, abortControllerRef.current.signal);
      } else {
          caption = await refineCaptionQwen('', qwenEndpoint, qwenEffectiveModel, fileToProcess.file, fileToProcess.caption, combinedInstructions, qwenVideoFrameCount, abortControllerRef.current.signal);
      }
      
      updateFile(id, { caption, status: GenerationStatus.SUCCESS });
    } catch (err: any) {
      if (err.name === 'AbortError' || err.message === 'AbortError') {
          updateFile(id, { status: GenerationStatus.IDLE, errorMessage: "Stopped by user" });
      } else {
          updateFile(id, { status: GenerationStatus.ERROR, errorMessage: err.message });
      }
    }
  }, [mediaFiles, apiProvider, qwenEndpoint, qwenEffectiveModel, qwenVideoFrameCount, grokApiKey, grokModel, openRouterApiKey, openRouterModel, openRouterMaxTokens, bulkRefinementInstructions, hasValidConfig, updateFile, geminiApiKey, geminiModel]);

  // --- QUEUE CONTROLLER ---
  const runTasksInQueue = async (tasks: (() => Promise<void>)[]) => {
    const signal = abortControllerRef.current.signal;
    setIsQueueRunning(true);
    const pool = new Set<Promise<void>>();
    for (const task of tasks) {
      if (signal.aborted) break;
      const promise = task();
      pool.add(promise);
      promise.finally(() => pool.delete(promise));
      if (pool.size >= concurrentTasks) {
        await Promise.race(pool);
      }
    }
    await Promise.all(pool);
    setIsQueueRunning(false);
  };

  const handleBulkGenerate = () => {
    if (abortControllerRef.current.signal.aborted) {
      abortControllerRef.current = new AbortController();
    }
    const tasks = selectedFiles.map(file => () => handleGenerateCaption(file.id, file.customInstructions));
    if (useRequestQueue) {
      runTasksInQueue(tasks);
    } else {
      tasks.forEach(t => t());
    }
  };

  const handleBulkRefine = () => {
    if (abortControllerRef.current.signal.aborted) {
      abortControllerRef.current = new AbortController();
    }
    const tasks = selectedFiles.map(file => () => handleRefineCaptionItem(file.id, file.customInstructions));
    if (useRequestQueue) {
      runTasksInQueue(tasks);
    } else {
      tasks.forEach(t => t());
    }
  };

  const handleBulkQualityCheck = () => {
    if (abortControllerRef.current.signal.aborted) {
      abortControllerRef.current = new AbortController();
    }
    const tasks = selectedFiles.map(file => () => handleCheckQuality(file.id));
    if (useRequestQueue) {
      runTasksInQueue(tasks);
    } else {
      tasks.forEach(t => t());
    }
  };

  const handleClearWorkflow = useCallback(() => {
    setComfyWorkflow(DEFAULT_COMFY_WORKFLOW);
    setComfyWorkflowName('Default Workflow');
  }, []);

  const handleComfyPreview = useCallback(async (id: string) => {
    const item = (mediaFiles || []).find(m => m.id === id);
    if (!item || !comfyWorkflow || !comfyUrl) return;

    updateFile(id, { comfyStatus: 'generating', comfyErrorMessage: undefined });
    try {
        const previewUrl = await sendComfyPrompt(comfyUrl, comfyWorkflow, item.caption, comfySeed, comfySteps, useSecureBridge, abortControllerRef.current.signal);
        updateFile(id, { comfyPreviewUrl: previewUrl, comfyStatus: 'success' });
    } catch (err: any) {
        if (err.name === 'AbortError' || err.message === 'Aborted') {
            updateFile(id, { comfyStatus: 'idle', comfyErrorMessage: "Stopped" });
        } else {
            updateFile(id, { comfyStatus: 'error', comfyErrorMessage: err.message });
        }
    }
  }, [mediaFiles, comfyWorkflow, comfyUrl, comfySeed, comfySteps, useSecureBridge, updateFile]);

  const handleBulkPreview = () => {
    selectedFiles.forEach(file => handleComfyPreview(file.id));
  };

  const handleDeleteSelected = useCallback(() => {
    setMediaFiles(prev => {
      const remaining = (prev || []).filter(mf => !mf.isSelected);
      return remaining || [];
    });
    setLastSelectedIndex(null);
  }, []);

  const handleStopTasks = () => {
    abortControllerRef.current.abort();
    setIsQueueRunning(false);
    setMediaFiles(prev => (prev || []).map(mf => {
      if (mf.status === GenerationStatus.GENERATING || mf.status === GenerationStatus.CHECKING) {
        return { ...mf, status: GenerationStatus.IDLE, errorMessage: "Stopped by user" };
      }
      if (mf.comfyStatus === 'generating') {
        return { ...mf, comfyStatus: 'idle', comfyErrorMessage: "Stopped" };
      }
      return mf;
    }));
  };

  const handleExportDataset = useCallback(async () => {
    if (selectedFiles.length === 0) return;
    const JSZip = (window as any).JSZip;
    if (!JSZip) return alert("JSZip not loaded.");

    setIsExporting(true);
    try {
      const zip = new JSZip();
      const prefix = datasetPrefix.trim() || 'item';
      selectedFiles.forEach((mf, idx) => {
        const fileExt = mf.file.name.split('.').pop() || 'dat';
        const finalName = `${prefix}_${idx + 1}`;
        zip.file(`${finalName}.${fileExt}`, mf.file);
        zip.file(`${finalName}.txt`, mf.caption || "");
      });
      const content = await zip.generateAsync({ type: 'blob' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(content);
      link.download = `lora_dataset_${new Date().getTime()}.zip`;
      link.click();
    } catch (err: any) {
        alert("Export failed: " + err.message);
    } finally { setIsExporting(false); }
  }, [selectedFiles, datasetPrefix]);

  const handleNextPreview = useCallback(() => {
    if (!activePreviewId || (mediaFiles || []).length <= 1) return;
    const currentIndex = mediaFiles.findIndex(m => m.id === activePreviewId);
    const nextIndex = (currentIndex + 1) % mediaFiles.length;
    setActivePreviewId(mediaFiles[nextIndex].id);
  }, [activePreviewId, mediaFiles]);

  const handlePrevPreview = useCallback(() => {
    if (!activePreviewId || (mediaFiles || []).length <= 1) return;
    const currentIndex = mediaFiles.findIndex(m => m.id === activePreviewId);
    const prevIndex = (currentIndex - 1 + mediaFiles.length) % mediaFiles.length;
    setActivePreviewId(mediaFiles[prevIndex].id);
  }, [activePreviewId, mediaFiles]);

  const downloadQwenSetupScript = () => {
    const isWin = qwenOsType === 'windows';
    const content = isWin 
      ? `@echo off\nSETLOCAL EnableDelayedExpansion\necho [LoRA Caption Assistant] Starting Local Qwen Setup for Windows...\n\n:: Check for Python\npython --version >nul 2>&1\nif %errorlevel% neq 0 (\n    echo [ERROR] Python not found! Please install Python 3.10+ from python.org\n    pause\n    exit /b\n)\n\necho [1/3] Creating Virtual Environment...\npython -m venv venv\nif %errorlevel% neq 0 (\n    echo [ERROR] Failed to create venv.\n    pause\n    exit /b\n)\n\necho [2/3] Activating Environment and Upgrading Pip...\ncall venv\\Scripts\\activate\npython -m pip install --upgrade pip\n\necho [3/3] Installing vLLM and Dependencies...\necho vLLM natively on Windows is Experimental. Using WSL2 is highly recommended.\necho Attempting installation of bitsandbytes and requirements...\npip install bitsandbytes requests\n:: Note: Users often need specific wheels for vLLM on Windows or WSL2.\necho To run vLLM on Windows, please follow the official guide for WSL2.\necho This script sets up the local Python environment for bridging.\npause`
      : `#!/bin/bash\npython3 -m venv venv\nsource venv/bin/activate\npip install vllm bitsandbytes\necho Setup Complete.`;
    const filename = isWin ? 'setup_qwen.bat' : 'setup_qwen.sh';
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadBridgeSetupScript = () => {
    const isWin = bridgeOsType === 'windows';
    const content = isWin 
      ? `@echo off\nSETLOCAL EnableDelayedExpansion\necho [LoRA Caption Assistant] Starting Secure Bridge Setup for Windows...\n\n:: Check for Python\npython --version >nul 2>&1\nif %errorlevel% neq 0 (\n    echo [ERROR] Python not found! Please install Python 3.10+ from python.org\n    pause\n    exit /b\n)\n\necho [1/3] Creating Virtual Environment...\npython -m venv venv\nif %errorlevel% neq 0 (\n    echo [ERROR] Failed to create venv.\n    pause\n    exit /b\n)\n\necho [2/3] Activating Environment...\ncall venv\\Scripts\\activate\n\necho [3/3] Installing Bridge Dependencies...\npip install flask flask-cors requests\nif %errorlevel% neq 0 (\n    echo [ERROR] Installation failed.\n    pause\n    exit /b\n)\n\necho Bridge Setup Complete. You can now download bridge.py and run it using the command shown in the app.\npause`
      : `#!/bin/bash\npython3 -m venv venv\nsource venv/bin/activate\npip install vllm bitsandbytes\necho Setup Complete.`;
    const filename = isWin ? 'setup_bridge.bat' : 'setup_bridge.sh';
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadBridgeScript = () => {
    const code = `import requests\nfrom flask import Flask, request, Response\nfrom flask_cors import CORS\napp = Flask(__name__)\nCORS(app)\nTARGET = "http://127.0.0.1:8188"\n@app.route('/', defaults={'path': ''}, methods=['GET','POST','PUT','DELETE','PATCH','OPTIONS'])\n@app.route('/<path:path>', methods=['GET','POST','PUT','DELETE','PATCH','OPTIONS'])\ndef proxy(path):\n  url = f"{TARGET}/{path}"\n  headers = {k:v for k,v in request.headers.items() if k.lower() not in ['host', 'origin', 'referer']}\n  resp = requests.request(method=request.method, url=url, headers=headers, data=request.get_data(), params=request.args, stream=True)\n  return Response(resp.content, resp.status_code, [(n,v) for n,v in resp.headers.items() if n.lower() not in ['content-encoding','content-length','transfer-encoding','connection']])\nif __name__ == '__main__': app.run(port=5000, host='0.0.0.0')`;
    const blob = new Blob([code], { type: 'text/x-python' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bridge.py';
    a.click();
    URL.revokeObjectURL(url);
  };

  // --- RENDER ---
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 font-sans p-4 sm:p-8">
      {/* PREVIEW MODAL */}
      {activePreviewId && currentPreviewItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/95 backdrop-blur-sm animate-fade-in" onClick={() => setActivePreviewId(null)}>
              <div className="bg-gray-900 w-full max-w-6xl rounded-2xl border border-gray-700 overflow-hidden flex flex-col max-h-[95vh] animate-scale-up shadow-2xl relative" onClick={(e) => e.stopPropagation()}>
                  <button onClick={handlePrevPreview} className="absolute left-4 top-1/2 -translate-y-1/2 z-10 p-4 bg-gray-800/80 hover:bg-indigo-600 rounded-full text-white shadow-2xl transition-all border border-white/5 active:scale-90">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M15 19l-7-7 7-7"/></svg>
                  </button>
                  <button onClick={handleNextPreview} className="absolute right-4 top-1/2 -translate-y-1/2 z-10 p-4 bg-gray-800/80 hover:bg-indigo-600 rounded-full text-white shadow-2xl transition-all border border-white/5 active:scale-90">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M9 5l7 7-7 7"/></svg>
                  </button>
                  <div className="px-6 py-4 border-b border-gray-800 flex justify-between items-center bg-gray-850">
                      <div className="flex items-center gap-4">
                        <SparklesIcon className="w-5 h-5 text-indigo-400" />
                        <div className="flex flex-col">
                            <h3 className="text-xs font-black uppercase tracking-widest text-gray-400">{(mediaFiles || []).findIndex(m => m.id === activePreviewId) + 1} of {mediaFiles.length}</h3>
                            <h3 className="text-[11px] font-bold truncate max-w-md text-gray-500">{currentPreviewItem.file.name}</h3>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={handlePrevPreview} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-xl text-[10px] font-black uppercase transition-all">Prev</button>
                        <button onClick={handleNextPreview} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-xl text-[10px] font-black uppercase transition-all">Next</button>
                        <button onClick={() => setActivePreviewId(null)} className="ml-4 p-2 hover:bg-red-600/20 rounded-full transition-colors text-gray-500 hover:text-red-400"><XIcon className="w-5 h-5" /></button>
                      </div>
                  </div>
                  <div className="flex-grow overflow-y-auto p-6 space-y-8 bg-black/40">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 h-[450px]">
                          <div className="bg-black rounded-2xl border border-gray-800 flex items-center justify-center overflow-hidden relative shadow-inner">
                             {currentPreviewItem.file.type.startsWith('video/') ? <video src={currentPreviewItem.previewUrl} className="max-h-full" controls /> : <img src={currentPreviewItem.previewUrl} className="max-h-full object-contain" />}
                             <div className="absolute top-3 left-3 bg-black/70 backdrop-blur-md px-3 py-1 rounded-lg text-[10px] font-black uppercase text-white/80 border border-white/5">Original Data</div>
                          </div>
                          <div className="bg-black rounded-2xl border border-gray-800 flex items-center justify-center relative overflow-hidden shadow-inner">
                             {currentPreviewItem.comfyPreviewUrl ? <img src={currentPreviewItem.comfyPreviewUrl} className="max-h-full object-contain" /> : <div className="text-xs uppercase text-gray-700 tracking-widest font-black">No Preview Rendered</div>}
                             {currentPreviewItem.comfyStatus === 'generating' && <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-3"><LoaderIcon className="w-10 h-10 animate-spin text-orange-500" /><span className="text-xs font-black uppercase text-orange-400 tracking-widest">Rendering via ComfyUI...</span></div>}
                             <div className="absolute top-3 left-3 bg-orange-600/70 backdrop-blur-md px-3 py-1 rounded-lg text-[10px] font-black uppercase text-white/90 border border-white/5">ComfyUI Render</div>
                          </div>
                      </div>
                      <div className="space-y-6">
                          <textarea value={currentPreviewItem.caption} onChange={(e) => updateFile(currentPreviewItem.id, { caption: e.target.value })} className="w-full bg-gray-950 border border-gray-700 rounded-2xl p-6 text-sm h-40 outline-none focus:ring-2 focus:ring-indigo-500 transition-all shadow-inner leading-relaxed" />
                          <div className="flex gap-4">
                             <input type="text" value={currentPreviewItem.customInstructions} onChange={(e) => updateFile(currentPreviewItem.id, { customInstructions: e.target.value })} placeholder="Refine caption instructions..." className="flex-grow bg-gray-800 border border-gray-700 rounded-xl px-5 py-3 text-sm outline-none focus:ring-1 focus:ring-indigo-500 shadow-sm" />
                             <button onClick={() => handleGenerateCaption(currentPreviewItem.id, currentPreviewItem.customInstructions)} className="px-8 py-3 bg-green-600 hover:bg-green-500 text-white rounded-xl text-xs font-black uppercase transition-all shadow-xl active:scale-95">Re-Generate</button>
                             <button onClick={() => handleRefineCaptionItem(currentPreviewItem.id, currentPreviewItem.customInstructions)} className="px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black uppercase transition-all shadow-xl active:scale-95">Refine</button>
                             <button onClick={() => handleCheckQuality(currentPreviewItem.id)} className="px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-black uppercase transition-all shadow-xl active:scale-95">Check Quality</button>
                             <button onClick={() => handleComfyPreview(currentPreviewItem.id)} className="px-8 py-3 bg-orange-600 hover:bg-orange-500 text-white rounded-xl text-xs font-black uppercase transition-all shadow-xl active:scale-95">Preview</button>
                          </div>
                      </div>
                  </div>
              </div>
          </div>
      )}

      <main className="max-w-6xl mx-auto space-y-8 animate-fade-in">
        <section className="bg-gray-900 border border-gray-800 p-8 rounded-3xl shadow-2xl space-y-12">
            <h2 className="text-3xl font-black flex items-center gap-4 uppercase tracking-tighter text-white">1. Global Settings & Actions</h2>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
                <div className="space-y-10">
                    <div>
                        <label className="text-xs font-black text-gray-500 uppercase tracking-widest block mb-4">AI Provider</label>
                        <div className="flex p-1.5 bg-black rounded-2xl border border-gray-800 shadow-inner">
                            <button onClick={() => setApiProvider('gemini')} className={`flex-1 py-3 text-[10px] font-black uppercase rounded-xl transition-all ${apiProvider === 'gemini' ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-600 hover:text-gray-400'}`}>Google Gemini</button>
                            <button onClick={() => setApiProvider('grok')} className={`flex-1 py-3 text-[10px] font-black uppercase rounded-xl transition-all ${apiProvider === 'grok' ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-600 hover:text-gray-400'}`}>xAI Grok</button>
                            <button onClick={() => setApiProvider('qwen')} className={`flex-1 py-3 text-[10px] font-black uppercase rounded-xl transition-all ${apiProvider === 'qwen' ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-600 hover:text-gray-400'}`}>Local Qwen</button>
                            <button onClick={() => setApiProvider('openrouter')} className={`flex-1 py-3 text-[10px] font-black uppercase rounded-xl transition-all ${apiProvider === 'openrouter' ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-600 hover:text-gray-400'}`}>OpenRouter</button>
                        </div>
                    </div>

                    {apiProvider === 'openrouter' && (
                        <div className="bg-blue-500/5 border border-blue-500/20 p-6 rounded-3xl space-y-6 animate-slide-down shadow-xl">
                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <label className="text-[10px] font-black text-blue-400 uppercase tracking-widest">OpenRouter Model / URL</label>
                                </div>
                                <div className="space-y-2">
                                    <select 
                                        value={OPENROUTER_MODELS.some(m => m.id === openRouterModel) ? openRouterModel : 'custom'} 
                                        onChange={(e) => {
                                            if (e.target.value === 'custom') {
                                                setOpenRouterModel('');
                                            } else {
                                                setOpenRouterModel(e.target.value);
                                            }
                                        }}
                                        className="w-full p-3 bg-black border border-blue-500/30 rounded-xl text-xs font-bold text-gray-300 shadow-inner focus:ring-1 focus:ring-blue-500 outline-none"
                                    >
                                        {OPENROUTER_MODELS.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                        <option value="custom">Custom Model ID / URL</option>
                                    </select>
                                    {!OPENROUTER_MODELS.some(m => m.id === openRouterModel) && (
                                        <input 
                                            type="text" 
                                            value={openRouterModel} 
                                            onChange={(e) => setOpenRouterModel(e.target.value)}
                                            placeholder="e.g. anthropic/claude-3-opus or https://openrouter.ai/..."
                                            className="w-full p-3 bg-black border border-blue-500/30 rounded-xl text-xs font-mono text-gray-300 shadow-inner focus:ring-1 focus:ring-blue-500 outline-none"
                                        />
                                    )}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-4">
                                    <div className="flex justify-between items-center">
                                        <label className="text-[10px] font-black text-blue-400 uppercase tracking-widest">OpenRouter API Key</label>
                                        {openRouterApiKey && <span className="flex items-center gap-1.5 text-[9px] font-black uppercase text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full"><CheckCircleIcon className="w-3 h-3"/> Configured</span>}
                                    </div>
                                    <div className="relative group">
                                        <input 
                                            type="password" 
                                            value={openRouterApiKey} 
                                            onChange={(e) => setOpenRouterApiKey(e.target.value)}
                                            placeholder="sk-or-v1-..."
                                            className="w-full py-4 px-5 bg-black border border-blue-500/30 rounded-2xl text-xs font-mono shadow-inner focus:ring-1 focus:ring-blue-500 outline-none hover:border-blue-500/60 transition-all"
                                        />
                                        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-blue-400/50 group-hover:text-blue-400 transition-colors">
                                            <SparklesIcon className="w-5 h-5" />
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div className="flex justify-between items-center">
                                        <label className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Max Tokens</label>
                                        <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">{openRouterMaxTokens}</span>
                                    </div>
                                    <div className="relative group">
                                        <input 
                                            type="number" 
                                            value={openRouterMaxTokens} 
                                            onChange={(e) => setOpenRouterMaxTokens(parseInt(e.target.value) || 4096)}
                                            min="1"
                                            max="32768"
                                            className="w-full py-4 px-5 bg-black border border-blue-500/30 rounded-2xl text-xs font-mono shadow-inner focus:ring-1 focus:ring-blue-500 outline-none hover:border-blue-500/60 transition-all"
                                        />
                                        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-blue-400/50 group-hover:text-blue-400 transition-colors">
                                            <WandIcon className="w-5 h-5" />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-4">
                                    <div className="flex justify-between items-center">
                                        <label className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Temperature</label>
                                        <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">{openRouterTemperature}</span>
                                    </div>
                                    <div className="relative group">
                                        <input 
                                            type="range" 
                                            min="0" 
                                            max="2" 
                                            step="0.1"
                                            value={openRouterTemperature} 
                                            onChange={(e) => setOpenRouterTemperature(parseFloat(e.target.value))}
                                            className="w-full h-2 bg-black border border-blue-500/30 rounded-lg appearance-none cursor-pointer accent-blue-500"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div className="flex justify-between items-center">
                                        <label className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Video Mode</label>
                                    </div>
                                    <button 
                                        onClick={() => setOpenRouterUseFullVideo(!openRouterUseFullVideo)}
                                        className={`w-full py-4 px-5 border rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-between ${openRouterUseFullVideo ? 'bg-blue-500/20 border-blue-500 text-blue-400' : 'bg-black border-blue-500/30 text-gray-500 hover:border-blue-500/60'}`}
                                    >
                                        {openRouterUseFullVideo ? 'Full Video File' : '8 Frames (Snapshots)'}
                                        <div className={`w-8 h-4 rounded-full relative transition-colors ${openRouterUseFullVideo ? 'bg-blue-500' : 'bg-gray-700'}`}>
                                            <div className={`absolute top-1 w-2 h-2 bg-white rounded-full transition-all ${openRouterUseFullVideo ? 'right-1' : 'left-1'}`} />
                                        </div>
                                    </button>
                                </div>
                            </div>
                            <p className="text-[10px] text-gray-500 flex items-center gap-1.5 px-1">
                                <AlertTriangleIcon className="w-3 h-3 text-blue-400" />
                                Get an API key from 
                                <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline font-bold">OpenRouter Keys</a>
                            </p>
                        </div>
                    )}

                    {apiProvider === 'gemini' && (
                        <div className="bg-indigo-500/5 border border-indigo-500/20 p-6 rounded-3xl space-y-6 animate-slide-down shadow-xl">
                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <label className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Gemini Model Version</label>
                                </div>
                                <div className="space-y-2">
                                    <select 
                                        value={GEMINI_MODELS.some(m => m.id === geminiModel) ? geminiModel : 'custom'} 
                                        onChange={(e) => {
                                            if (e.target.value === 'custom') {
                                                setGeminiModel('');
                                            } else {
                                                setGeminiModel(e.target.value);
                                            }
                                        }}
                                        className="w-full p-3 bg-black border border-indigo-500/30 rounded-xl text-xs font-bold text-gray-300 shadow-inner focus:ring-1 focus:ring-indigo-500 outline-none"
                                    >
                                        {GEMINI_MODELS.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                        <option value="custom">Custom Model ID</option>
                                    </select>
                                    {!GEMINI_MODELS.some(m => m.id === geminiModel) && (
                                        <input 
                                            type="text" 
                                            value={geminiModel} 
                                            onChange={(e) => setGeminiModel(e.target.value)}
                                            placeholder="e.g. gemini-2.0-flash-exp"
                                            className="w-full p-3 bg-black border border-indigo-500/30 rounded-xl text-xs font-mono text-gray-300 shadow-inner focus:ring-1 focus:ring-indigo-500 outline-none"
                                        />
                                    )}
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <label className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Gemini API Key</label>
                                    {geminiApiKey && <span className="flex items-center gap-1.5 text-[9px] font-black uppercase text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full"><CheckCircleIcon className="w-3 h-3"/> Configured</span>}
                                </div>
                                <div className="relative group">
                                    <input 
                                        type="password" 
                                        value={geminiApiKey} 
                                        onChange={(e) => setGeminiApiKey(e.target.value)}
                                        placeholder="Enter your Gemini API key here..."
                                        className="w-full py-4 px-5 bg-black border border-indigo-500/30 rounded-2xl text-xs font-mono shadow-inner focus:ring-1 focus:ring-indigo-500 outline-none hover:border-indigo-500/60 transition-all"
                                    />
                                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-indigo-400/50 group-hover:text-indigo-400 transition-colors">
                                        <SparklesIcon className="w-5 h-5" />
                                    </div>
                                </div>
                            </div>
                            <p className="text-[10px] text-gray-500 flex items-center gap-1.5 px-1">
                                <AlertTriangleIcon className="w-3 h-3 text-indigo-400" />
                                Get an API key from 
                                <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline font-bold">Google AI Studio</a>
                            </p>
                        </div>
                    )}

                    {apiProvider === 'grok' && (
                        <div className="bg-orange-500/5 border border-orange-500/20 p-6 rounded-3xl space-y-6 animate-slide-down shadow-xl">
                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <label className="text-[10px] font-black text-orange-400 uppercase tracking-widest">Grok Model Version</label>
                                </div>
                                <select 
                                    value={grokModel} 
                                    onChange={(e) => setGrokModel(e.target.value)}
                                    className="w-full p-3 bg-black border border-orange-500/30 rounded-xl text-xs font-bold text-gray-300 shadow-inner focus:ring-1 focus:ring-orange-500 outline-none"
                                >
                                    {GROK_MODELS.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                </select>
                            </div>

                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <label className="text-[10px] font-black text-orange-400 uppercase tracking-widest">xAI API Key</label>
                                    {grokApiKey && <span className="flex items-center gap-1.5 text-[9px] font-black uppercase text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full"><CheckCircleIcon className="w-3 h-3"/> Configured</span>}
                                </div>
                                <div className="relative group">
                                    <input 
                                        type="password" 
                                        value={grokApiKey} 
                                        onChange={(e) => setGrokApiKey(e.target.value)}
                                        placeholder="Enter your xAI Grok API key here..."
                                        className="w-full py-4 px-5 bg-black border border-orange-500/30 rounded-2xl text-xs font-mono shadow-inner focus:ring-1 focus:ring-orange-500 outline-none hover:border-orange-500/60 transition-all"
                                    />
                                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-orange-400/50 group-hover:text-orange-400 transition-colors">
                                        <SparklesIcon className="w-5 h-5" />
                                    </div>
                                </div>
                            </div>
                            <p className="text-[10px] text-gray-500 flex items-center gap-1.5 px-1">
                                <AlertTriangleIcon className="w-3 h-3 text-orange-400" />
                                Get an API key from 
                                <a href="https://console.x.ai/" target="_blank" rel="noopener noreferrer" className="text-orange-400 hover:underline font-bold">xAI Console</a>
                            </p>
                        </div>
                    )}

                    {apiProvider === 'qwen' && (
                        <div className="bg-gray-950 p-6 rounded-3xl border border-gray-800 space-y-6 animate-slide-down shadow-xl">
                            <div className="flex justify-between items-center mb-2">
                                <label className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Local Model Configuration</label>
                                <div className="flex items-center gap-4">
                                  <label className="flex items-center gap-2 cursor-pointer group">
                                      <input type="checkbox" checked={useOfflineSnapshot} onChange={e => setUseOfflineSnapshot(e.target.checked)} className="h-4 w-4 rounded bg-gray-800 border-gray-700 text-indigo-600" />
                                      <span className="text-[10px] font-bold text-orange-400 group-hover:text-orange-300">Use Offline Local Snapshot</span>
                                  </label>
                                  {!useOfflineSnapshot && (
                                    <label className="flex items-center gap-2 cursor-pointer group">
                                        <input type="checkbox" checked={useCustomQwenModel} onChange={e => setUseCustomQwenModel(e.target.checked)} className="h-4 w-4 rounded bg-gray-800 border-gray-700 text-indigo-600" />
                                        <span className="text-[10px] font-bold text-gray-500 group-hover:text-gray-300">Custom Model ID</span>
                                    </label>
                                  )}
                                </div>
                            </div>
                            
                            {useOfflineSnapshot ? (
                              <div className="space-y-4 animate-slide-down">
                                <div className="space-y-1">
                                    <label className="text-[9px] font-black text-gray-700 uppercase">Snapshot Directory Path</label>
                                    <input type="text" value={snapshotPath} onChange={e => setSnapshotPath(e.target.value)} placeholder="/path/to/hf_cache/.../snapshots/hash..." className="w-full p-2.5 bg-black border border-gray-800 rounded-xl text-xs font-mono shadow-inner" />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[9px] font-black text-gray-700 uppercase">Virtual Model Name (Served Name)</label>
                                    <input type="text" value={virtualModelName} onChange={e => setVirtualModelName(e.target.value)} placeholder="org/model-id..." className="w-full p-3 bg-black border border-gray-800 rounded-xl text-xs font-mono shadow-inner" />
                                </div>
                              </div>
                            ) : useCustomQwenModel ? (
                                <input type="text" value={customQwenModelId} onChange={e => setCustomQwenModelId(e.target.value)} placeholder="org/model-id..." className="w-full p-3 bg-black border border-gray-800 rounded-xl text-xs font-mono shadow-inner" />
                            ) : (
                                <select value={qwenModel} onChange={e => setQwenModel(e.target.value)} className="w-full p-3 bg-black border border-gray-800 rounded-xl text-xs font-bold text-gray-300 shadow-inner">
                                    {QWEN_MODELS.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                </select>
                            )}

                            <div className="pt-4 border-t border-gray-800 space-y-4">
                                <div className="flex justify-between items-center">
                                    <span className="text-[10px] font-black text-gray-600 uppercase">OS Type:</span>
                                    <div className="flex gap-2">
                                        <button onClick={() => setQwenOsType('windows')} className={`px-3 py-1 text-[9px] font-black uppercase rounded-lg transition-all ${qwenOsType === 'windows' ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:text-gray-400'}`}>Windows</button>
                                        <button onClick={() => setQwenOsType('linux')} className={`px-3 py-1 text-[9px] font-black uppercase rounded-lg transition-all ${qwenOsType === 'linux' ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:text-gray-400'}`}>Linux</button>
                                    </div>
                                </div>
                                
                                <div className="grid grid-cols-4 gap-4">
                                    <div className="col-span-3 space-y-1">
                                        <label className="text-[9px] font-black text-gray-700 uppercase">Install Path</label>
                                        <input type="text" value={qwenInstallDir} onChange={e => setQwenInstallDir(e.target.value)} className="w-full p-2.5 bg-black border border-gray-800 rounded-xl text-xs font-mono" />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[9px] font-black text-gray-700 uppercase">Max Tokens</label>
                                        <input type="number" value={qwenMaxTokens} onChange={e => setQwenMaxTokens(Number(e.target.value))} className="w-full p-2.5 bg-black border border-gray-800 rounded-xl text-xs text-center" />
                                    </div>
                                </div>

                                <div className="flex flex-col gap-2">
                                    <label className="flex items-center gap-2 cursor-pointer group">
                                        <input type="checkbox" checked={qwen8Bit} onChange={e => setQwen8Bit(e.target.checked)} className="h-4 w-4 rounded bg-gray-800 text-indigo-600" />
                                        <span className="text-[10px] font-bold text-gray-500 group-hover:text-gray-300">Enable 8-bit Quantization (bitsandbytes)</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer group">
                                        <input type="checkbox" checked={qwenEager} onChange={e => setQwenEager(e.target.checked)} className="h-4 w-4 rounded bg-gray-950 text-indigo-600" />
                                        <span className="text-[10px] font-bold text-gray-500 group-hover:text-gray-300">Enforce Eager Mode</span>
                                    </label>
                                </div>

                                <button onClick={downloadQwenSetupScript} className="w-full py-3 bg-green-700 hover:bg-green-600 text-white text-[10px] font-black uppercase rounded-xl transition-all shadow-lg">Download {qwenOsType === 'windows' ? 'setup_qwen.bat' : 'setup_qwen.sh'}</button>

                                <div className="space-y-2">
                                    <label className="text-[9px] font-black text-gray-700 uppercase">Local Start Command:</label>
                                    <div className="relative group">
                                        <div className="p-3 bg-black rounded-xl border border-gray-900 font-mono text-[10px] text-green-500/80 break-all leading-relaxed max-h-24 overflow-y-auto shadow-inner">
                                            {qwenStartCommand}
                                        </div>
                                        <button onClick={() => navigator.clipboard.writeText(qwenStartCommand)} className="absolute top-2 right-2 p-1.5 bg-gray-800 hover:bg-gray-700 text-gray-400 rounded-lg opacity-0 group-hover:opacity-100 transition-all"><CopyIcon className="w-3.5 h-3.5"/></button>
                                    </div>
                                </div>
                                
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Endpoint URL (Tunnel or Local)</label>
                                    <input type="text" value={qwenEndpoint} onChange={e => setQwenEndpoint(e.target.value)} placeholder="http://localhost:8000/v1" className="w-full p-3 bg-black border border-gray-800 rounded-xl text-xs font-mono shadow-inner focus:ring-1 focus:ring-indigo-500 outline-none" />
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="space-y-6">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Trigger Word</label>
                                <input type="text" value={triggerWord} onChange={e => setTriggerWord(e.target.value)} className="w-full p-3 bg-gray-950 border border-gray-800 rounded-2xl text-sm font-bold shadow-inner" placeholder="MyStyle" />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">File Prefix</label>
                                <input type="text" value={datasetPrefix} onChange={e => setDatasetPrefix(e.target.value)} className="w-full p-3 bg-gray-950 border border-gray-800 rounded-2xl text-sm font-bold shadow-inner" placeholder="item" />
                            </div>
                        </div>
                        <div className="bg-gray-800/40 p-5 rounded-3xl border border-gray-800 space-y-4 shadow-xl">
                            <label className="flex items-center gap-3 cursor-pointer group">
                                <input type="checkbox" checked={isCharacterTaggingEnabled} onChange={(e) => setIsCharacterTaggingEnabled(e.target.checked)} className="h-6 w-6 rounded-lg bg-gray-900 border-gray-700 text-indigo-600 transition-all shadow-sm" />
                                <span className="text-xs font-black text-gray-500 uppercase tracking-wider group-hover:text-gray-300 transition-colors">Character Tagging</span>
                            </label>
                            {isCharacterTaggingEnabled && (
                                <div className="animate-slide-down">
                                    <input type="text" value={characterShowName} onChange={(e) => setCharacterShowName(e.target.value)} placeholder="Enter show/series name..." className="w-full p-3 bg-gray-950 border border-gray-700 rounded-xl text-xs font-medium focus:ring-1 focus:ring-indigo-500 outline-none transition-all shadow-inner" />
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="space-y-10">
                    <div className="space-y-8">
                        <div className="space-y-3">
                            <label className="text-xs font-black text-gray-500 uppercase tracking-widest block">System Instructions & Prompting</label>
                            <textarea value={bulkGenerationInstructions} onChange={(e) => setBulkGenerationInstructions(e.target.value)} className="w-full p-5 bg-gray-950 border border-gray-800 rounded-3xl text-[13px] h-40 leading-relaxed resize-none outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner" placeholder="Enter global captioning rules..." />
                        </div>
                        <div className="space-y-3">
                            <label className="text-xs font-black text-indigo-400 uppercase tracking-widest block">Refinement Instructions</label>
                            <textarea value={bulkRefinementInstructions} onChange={(e) => setBulkRefinementInstructions(e.target.value)} className="w-full p-5 bg-gray-950 border border-indigo-500/20 rounded-3xl text-[13px] h-40 leading-relaxed resize-none outline-none focus:ring-2 focus:ring-indigo-500 shadow-inner" placeholder="Enter instructions for refining existing captions..." />
                        </div>
                    </div>

                    <div className="flex flex-col gap-6 pt-4 border-t border-gray-800">
                        <div className="flex flex-wrap gap-x-8 gap-y-4">
                            <label className="flex items-center gap-3 cursor-pointer group">
                                <input type="checkbox" checked={autofitTextareas} onChange={(e) => setAutofitTextareas(e.target.checked)} className="h-5 w-5 rounded-md bg-gray-900 border-gray-700 text-indigo-500 shadow-inner" />
                                <span className="text-xs font-bold text-gray-500 uppercase group-hover:text-gray-300 transition-colors">Autofit Textboxes</span>
                            </label>
                            <label className="flex items-center gap-3 cursor-pointer group">
                                <input type="checkbox" checked={showSideBySidePreview} onChange={(e) => setShowSideBySidePreview(e.target.checked)} className="h-5 w-5 rounded-md bg-gray-900 border-gray-700 text-indigo-500 shadow-inner" />
                                <span className="text-xs font-bold text-gray-500 uppercase group-hover:text-gray-300 transition-colors">Side-by-Side Comparison</span>
                            </label>
                            <label className="flex items-center gap-3 cursor-pointer group">
                                <input type="checkbox" checked={isComfyEnabled} onChange={(e) => setIsComfyEnabled(e.target.checked)} className="h-5 w-5 rounded-md bg-gray-900 border-gray-700 text-orange-500 shadow-inner" />
                                <span className="text-xs font-black text-orange-500 uppercase tracking-widest group-hover:text-orange-400 transition-colors">Enable ComfyUI Previews</span>
                            </label>
                        </div>
                        
                        <div className="bg-indigo-600/5 border border-indigo-600/20 p-6 rounded-3xl space-y-4">
                            <div className="flex justify-between items-center">
                                <label className="flex items-center gap-3 cursor-pointer group">
                                    <input type="checkbox" checked={useRequestQueue} onChange={(e) => setUseRequestQueue(e.target.checked)} className="h-5 w-5 rounded bg-gray-900 border-gray-700 text-indigo-500" />
                                    <span className="text-xs font-black text-indigo-400 uppercase tracking-widest group-hover:text-indigo-300 transition-colors">Enable Request Queue</span>
                                </label>
                                {useRequestQueue && (
                                    <div className="flex items-center gap-3">
                                        <label className="text-[10px] font-black text-gray-600 uppercase">Concurrent Tasks</label>
                                        <input type="number" min="1" max="10" value={concurrentTasks} onChange={(e) => setConcurrentTasks(Number(e.target.value))} className="w-16 p-1 bg-black border border-gray-800 rounded text-center text-xs font-bold" />
                                    </div>
                                )}
                            </div>
                            <p className="text-[10px] text-gray-600 italic">Recommended for Gemini Free Tier or Local GPU to prevent rate limits or OOM errors.</p>
                        </div>

                        {isComfyEnabled && (
                            <div className="bg-orange-600/5 border border-orange-600/20 p-6 rounded-3xl space-y-6 animate-slide-down shadow-xl">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-gray-600 uppercase">Endpoint</label>
                                        <input type="text" value={comfyUrl} onChange={(e) => setComfyUrl(e.target.value)} placeholder="http://127.0.0.1:8188" className="w-full p-3 bg-black border border-gray-800 rounded-xl text-xs font-mono shadow-inner" />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-gray-600 uppercase">Workflow ({comfyWorkflowName})</label>
                                        <div className="flex gap-2">
                                            <button onClick={() => document.getElementById('wf-up')?.click()} className="flex-1 py-2.5 bg-orange-600 hover:bg-orange-500 text-white rounded-xl shadow-lg transition-all active:scale-95 text-[10px] font-black uppercase tracking-widest">Load JSON</button>
                                            <button onClick={handleClearWorkflow} className="px-4 bg-gray-800 hover:bg-gray-700 text-gray-400 rounded-xl transition-all active:scale-95"><TrashIcon className="w-4 h-4"/></button>
                                            <input id="wf-up" type="file" accept=".json" onChange={(e) => {
                                                const f = e.target.files?.[0];
                                                if (f) {
                                                    const r = new FileReader();
                                                    r.onload = (ev) => {
                                                        try {
                                                            setComfyWorkflow(JSON.parse(ev.target?.result as string));
                                                            setComfyWorkflowName(f.name);
                                                        } catch { alert("Invalid Workflow JSON"); }
                                                    };
                                                    r.readAsText(f);
                                                }
                                            }} className="hidden" />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-gray-600 uppercase">Default Seed (-1 for random)</label>
                                        <input type="number" value={comfySeed} onChange={(e) => setComfySeed(Number(e.target.value))} className="w-full p-3 bg-black border border-gray-800 rounded-xl text-xs shadow-inner" />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-gray-600 uppercase">Steps</label>
                                        <input type="number" value={comfySteps} onChange={(e) => setComfySteps(Number(e.target.value))} className="w-full p-3 bg-black border border-gray-800 rounded-xl text-xs shadow-inner" />
                                    </div>
                                </div>

                                {/* Secure Bridge Sub-section */}
                                <div className="pt-6 border-t border-orange-600/10 space-y-6">
                                    <div className="flex justify-between items-center">
                                        <h3 className="text-[11px] font-black text-orange-400 uppercase tracking-widest">Secure Bridge (for HTTPS/Remote access)</h3>
                                        <label className="flex items-center gap-3 cursor-pointer group">
                                            <input type="checkbox" checked={useSecureBridge} onChange={(e) => setUseSecureBridge(e.target.checked)} className="h-5 w-5 rounded bg-gray-900 border-gray-700 text-orange-500" />
                                            <span className="text-[10px] font-bold text-gray-500 group-hover:text-gray-300 transition-colors">Enable Bridge Proxy</span>
                                        </label>
                                    </div>

                                    {useSecureBridge && (
                                        <div className="space-y-6 animate-slide-down">
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                <div className="space-y-2">
                                                    <label className="text-[9px] font-black text-gray-600 uppercase">Bridge OS</label>
                                                    <div className="flex gap-2">
                                                        <button onClick={() => setBridgeOsType('windows')} className={`flex-1 py-2 text-[10px] font-black uppercase rounded-lg transition-all ${bridgeOsType === 'windows' ? 'bg-orange-600 text-white' : 'bg-gray-800 text-gray-500'}`}>Windows</button>
                                                        <button onClick={() => setBridgeOsType('linux')} className={`flex-1 py-2 text-[10px] font-black uppercase rounded-lg transition-all ${bridgeOsType === 'linux' ? 'bg-orange-600 text-white' : 'bg-gray-800 text-gray-500'}`}>Linux</button>
                                                    </div>
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-[9px] font-black text-gray-600 uppercase">Install Path</label>
                                                    <input type="text" value={bridgeInstallPath} onChange={(e) => setBridgeInstallPath(e.target.value)} className="w-full p-3 bg-black border border-gray-800 rounded-xl text-xs font-mono shadow-inner" />
                                                </div>
                                            </div>

                                            <div className="space-y-4">
                                                <label className="flex items-center gap-3 cursor-pointer group">
                                                    <input type="checkbox" checked={isFirstTimeBridge} onChange={(e) => setIsFirstTimeBridge(e.target.checked)} className="h-4 w-4 rounded bg-gray-950 border-gray-800 text-orange-500" />
                                                    <span className="text-[10px] font-bold text-gray-500 group-hover:text-gray-300">First-time Setup (Include VENV & Pip Install)</span>
                                                </label>
                                                <div className="flex gap-4">
                                                    <button onClick={downloadBridgeSetupScript} className="flex-1 py-3 bg-indigo-700 hover:bg-indigo-600 text-white text-[10px] font-black uppercase rounded-xl transition-all shadow-lg">Download {bridgeOsType === 'windows' ? 'setup_bridge.bat' : 'setup_bridge.sh'}</button>
                                                    <button onClick={downloadBridgeScript} className="flex-1 py-3 bg-orange-700 hover:bg-orange-600 text-white text-[10px] font-black uppercase rounded-xl transition-all shadow-lg">Download Bridge.py</button>
                                                </div>
                                            </div>

                                            <div className="space-y-2">
                                                <label className="text-[9px] font-black text-gray-700 uppercase tracking-widest">Start Command:</label>
                                                <div className="relative group">
                                                    <div className="p-3 bg-black rounded-xl border border-gray-900 font-mono text-[10px] text-green-500/80 break-all leading-relaxed shadow-inner">
                                                        {bridgeStartCommand}
                                                    </div>
                                                    <button onClick={() => navigator.clipboard.writeText(bridgeStartCommand)} className="absolute top-2 right-2 p-1.5 bg-gray-800 hover:bg-gray-700 text-gray-400 rounded-lg opacity-0 group-hover:opacity-100 transition-all"><CopyIcon className="w-3.5 h-3.5"/></button>
                                                </div>
                                                <p className="text-[9px] text-gray-600 italic">The bridge will proxy requests from this HTTPS app to your local HTTP ComfyUI server.</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="border-t border-gray-800 pt-10 flex flex-col gap-6">
                <div className="flex flex-wrap gap-4 justify-end">
                    <button 
                      onClick={handleDeleteSelected} 
                      disabled={selectedFiles.length === 0}
                      className="px-6 py-4 bg-red-600/20 hover:bg-red-600/30 border border-red-600/30 rounded-2xl text-[11px] font-black uppercase text-red-400 flex items-center gap-3 transition-all active:scale-95 shadow-lg disabled:opacity-20 disabled:grayscale"
                    >
                      <TrashIcon className="w-5 h-5"/> Delete Selected ({selectedFiles.length})
                    </button>
                    <button onClick={handleStopTasks} className="px-6 py-4 bg-orange-600/20 hover:bg-orange-600/40 border border-orange-600/30 rounded-2xl text-[11px] font-black uppercase text-orange-400 flex items-center gap-3 transition-all active:scale-95 shadow-lg"><StopIcon className="w-5 h-5"/> Stop Tasks</button>
                    
                    <button onClick={handleBulkQualityCheck} disabled={selectedFiles.length === 0 || !hasValidConfig || isQueueRunning} className="px-6 py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl text-[11px] font-black uppercase flex items-center gap-4 transition-all shadow-xl active:scale-95 disabled:opacity-40">
                      <CheckCircleIcon className="w-5 h-5" /> Check Quality Selected ({selectedFiles.length})
                    </button>

                    <button onClick={handleBulkGenerate} disabled={selectedFiles.length === 0 || !hasValidConfig || isQueueRunning} className="px-10 py-4 bg-green-600 hover:bg-green-500 text-white rounded-2xl text-xs font-black uppercase flex items-center gap-4 transition-all shadow-2xl shadow-green-900/30 active:scale-95 disabled:opacity-40">
                        <SparklesIcon className="w-6 h-6" /> Generate Selected ({selectedFiles.length})
                    </button>
                    
                    <button onClick={handleBulkRefine} disabled={selectedFiles.length === 0 || !hasValidConfig || isQueueRunning} className="px-10 py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl text-xs font-black uppercase flex items-center gap-4 transition-all shadow-xl active:scale-95 disabled:opacity-40">
                        <WandIcon className="w-6 h-6" /> Refine Selected ({selectedFiles.length})
                    </button>
                </div>
                <div className="flex flex-wrap gap-4 justify-end">
                    {isComfyEnabled && (
                      <button onClick={handleBulkPreview} disabled={selectedFiles.length === 0} className="px-10 py-4 bg-orange-600 hover:bg-orange-500 text-white rounded-2xl text-xs font-black uppercase flex items-center gap-4 transition-all shadow-xl shadow-orange-900/20 active:scale-95 disabled:opacity-40">
                        <WandIcon className="w-6 h-6" /> Preview Selected ({selectedFiles.length})
                      </button>
                    )}
                    <button onClick={handleExportDataset} disabled={selectedFiles.length === 0 || isExporting} className="w-full sm:w-auto px-16 py-5 bg-indigo-700 hover:bg-indigo-600 text-white rounded-2xl text-xs font-black uppercase flex items-center justify-center gap-4 transition-all shadow-2xl active:scale-95 disabled:opacity-40">
                        {isExporting ? <LoaderIcon className="w-6 h-6 animate-spin" /> : <DownloadIcon className="w-6 h-6" />}
                        {isExporting ? 'Packaging ZIP...' : 'Download Finished Dataset'}
                    </button>
                </div>
            </div>
        </section>

        <section className="bg-gray-900 border border-gray-800 p-8 rounded-3xl shadow-xl overflow-hidden relative">
            <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none"><UploadCloudIcon className="w-32 h-32" /></div>
            <h2 className="text-xl font-black mb-6 uppercase tracking-widest text-gray-400">2. Upload Source Media</h2>
            <FileUploader onFilesAdded={handleFilesAdded} />
        </section>
        
        <section className="space-y-8 animate-slide-up min-h-[400px]">
          {mediaFiles && mediaFiles.length > 0 ? (
            <>
              <div className="flex justify-between items-center bg-gray-900/80 backdrop-blur-2xl p-6 rounded-3xl border border-gray-800 sticky top-4 z-40 shadow-[0_20px_50px_-10px_rgba(0,0,0,0.5)]">
                  <div className="flex items-center gap-4">
                      <div className="h-10 w-1.5 bg-indigo-500 rounded-full shadow-[0_0_15px_rgba(99,102,241,0.5)]"></div>
                      <div className="flex flex-col">
                          <h2 className="text-2xl font-black text-white uppercase tracking-tighter leading-none">3. Data Curation Workspace</h2>
                          <p className="text-[10px] font-black text-gray-600 uppercase tracking-widest mt-1">Ready for Parallel Processing ({mediaFiles.length} Loaded)</p>
                      </div>
                  </div>
                  <div className="flex items-center gap-6">
                      <div className="flex items-center gap-3 bg-black px-6 py-3 rounded-2xl border border-gray-800 shadow-inner group active:scale-95 transition-all">
                          <input type="checkbox" id="sel-all" className="h-6 w-6 rounded-lg bg-gray-900 border-gray-700 text-indigo-600 transition-all cursor-pointer shadow-sm" checked={mediaFiles.length > 0 && mediaFiles.every(f => f.isSelected)} onChange={(e) => setMediaFiles(prev => (prev || []).map(mf => ({ ...mf, isSelected: e.target.checked })))} />
                          <label htmlFor="sel-all" className="text-xs font-black text-gray-500 cursor-pointer group-hover:text-gray-300 transition-colors uppercase tracking-widest">Select All Items</label>
                      </div>
                  </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-12">
                {mediaFiles.map(item => (
                  <MediaItem 
                    key={item.id} 
                    item={item} 
                    autofit={autofitTextareas} 
                    isApiKeySet={hasValidConfig} 
                    isComfyEnabled={isComfyEnabled} 
                    showSideBySidePreview={showSideBySidePreview} 
                    onGenerate={handleGenerateCaption} 
                    onCheckQuality={handleCheckQuality}
                    onPreview={handleComfyPreview} 
                    onCaptionChange={(id, cap) => updateFile(id, { caption: cap })} 
                    onCustomInstructionsChange={(id, ins) => updateFile(id, { customInstructions: ins })} 
                    onSelectionChange={handleSelectionChange} 
                    onOpenPreviewModal={setActivePreviewId} 
                  />
                ))}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-32 bg-gray-900/50 rounded-3xl border-2 border-dashed border-gray-800 text-gray-500 animate-pulse">
                <UploadCloudIcon className="w-16 h-16 mb-6 opacity-20" />
                <h3 className="text-lg font-black uppercase tracking-widest text-gray-700">No items uploaded yet</h3>
                <p className="text-xs mt-2 uppercase tracking-tight text-gray-600">Start by dropping files into the upload zone above</p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

export default App;
