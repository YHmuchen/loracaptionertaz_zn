/**
 * Service for interacting with Qwen-VL via OpenAI-compatible endpoints.
 * This supports OpenRouter, Ollama, vLLM, etc.
 */

const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result); // This includes the data:image/png;base64, prefix
      } else {
        reject(new Error('Failed to convert file to base64'));
      }
    };
    reader.onerror = error => reject(error);
  });
};

const extractFramesFromVideo = async (videoFile: File, numberOfFrames: number): Promise<string[]> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    const url = URL.createObjectURL(videoFile);
    const frames: string[] = [];
    const timeout = setTimeout(() => {
        URL.revokeObjectURL(url);
        video.src = "";
        reject(new Error("Video processing timed out"));
    }, 60000);

    video.onloadeddata = async () => {
        const duration = video.duration;
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            clearTimeout(timeout);
            URL.revokeObjectURL(url);
            reject(new Error("Could not create canvas context"));
            return;
        }
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const step = duration / numberOfFrames;
        try {
            for (let i = 0; i < numberOfFrames; i++) {
                const time = (step * i) + (step / 2);
                await new Promise<void>((frameResolve) => {
                    const onSeeked = () => {
                        video.removeEventListener('seeked', onSeeked);
                        frameResolve();
                    };
                    video.addEventListener('seeked', onSeeked);
                    video.currentTime = time;
                });
                ctx.drawImage(video, 0, 0);
                frames.push(canvas.toDataURL('image/jpeg', 0.8));
            }
            clearTimeout(timeout);
            URL.revokeObjectURL(url);
            video.src = "";
            resolve(frames);
        } catch (e) {
            clearTimeout(timeout);
            URL.revokeObjectURL(url);
            reject(e);
        }
    };
    video.onerror = () => {
        clearTimeout(timeout);
        URL.revokeObjectURL(url);
        reject(new Error("Failed to load video file"));
    };
    video.src = url;
  });
};

const constructPrompt = (
    triggerWord: string, 
    customInstructions?: string,
    isCharacterTaggingEnabled?: boolean,
    characterShowName?: string
): string => {
  let basePrompt = `You are an expert captioner for AI model training data. Your task is to describe the provided image/video in detail for a style LoRA. Follow these rules strictly:
1. Start the caption with the trigger word: "${triggerWord}".
2. Describe EVERYTHING visible: characters, clothing, actions, background, objects, lighting, and camera angle.
3. Be objective and factual.
4. DO NOT mention the art style, "anime", "cartoon", "illustration", "2d", or "animation".
5. Write the description as a single, continuous paragraph.`;

  if (isCharacterTaggingEnabled && characterShowName && characterShowName.trim() !== '') {
    basePrompt += `\n6. After the description, identify any characters from the show "${characterShowName}" and append their tags to the very end of the caption, separated by commas. The format for each tag must be "char_[charactername]" (e.g., ", char_simon, char_kamina"). If no characters are recognized, add no tags.`;
  }

  if (customInstructions) {
    return `${basePrompt}\n\nIMPORTANT USER INSTRUCTIONS:\n${customInstructions}`;
  }
  return basePrompt;
};

export const generateCaptionQwen = async (
  apiKey: string,
  baseUrl: string,
  model: string,
  file: File,
  triggerWord: string,
  customInstructions?: string,
  isCharacterTaggingEnabled?: boolean,
  characterShowName?: string,
  videoFrameCount: number = 8,
  signal?: AbortSignal
): Promise<string> => {
  if (!baseUrl) throw new Error("Local Endpoint URL is required for Qwen.");
  let endpoint = baseUrl;
  if (!endpoint.includes('/chat/completions')) {
      endpoint = endpoint.replace(/\/+$/, '') + '/chat/completions';
  }
  const prompt = constructPrompt(triggerWord, customInstructions, isCharacterTaggingEnabled, characterShowName);
  let contentParts: any[] = [{ type: "text", text: prompt }];
  if (file.type.startsWith('video/')) {
    const frames = await extractFramesFromVideo(file, videoFrameCount);
    frames.forEach(frame => contentParts.push({ type: "image_url", image_url: { url: frame } }));
  } else {
    const base64Image = await fileToBase64(file);
    contentParts.push({ type: "image_url", image_url: { url: base64Image } });
  }
  const payload = {
    model: model || 'Qwen/Qwen2.5-VL-7B-Instruct',
    messages: [{ role: "user", content: contentParts }],
    max_tokens: 1000,
    temperature: 0.2
  };
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
  const response = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(payload), signal });
  if (!response.ok) throw new Error(`API Error: ${response.status}`);
  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || "";
};

export const refineCaptionQwen = async (
  apiKey: string,
  baseUrl: string,
  model: string,
  file: File,
  currentCaption: string,
  refinementInstructions: string,
  videoFrameCount: number = 8,
  signal?: AbortSignal
): Promise<string> => {
  let endpoint = baseUrl;
  if (!endpoint.includes('/chat/completions')) endpoint = endpoint.replace(/\/+$/, '') + '/chat/completions';
  const prompt = `Refine the following caption based on the visual information and the instructions. Output ONLY the refined text.
CURRENT CAPTION: "${currentCaption}"
INSTRUCTIONS: "${refinementInstructions}"`;
  let contentParts: any[] = [{ type: "text", text: prompt }];
  if (file.type.startsWith('video/')) {
    const frames = await extractFramesFromVideo(file, 4);
    frames.forEach(frame => contentParts.push({ type: "image_url", image_url: { url: frame } }));
  } else {
    const base64Image = await fileToBase64(file);
    contentParts.push({ type: "image_url", image_url: { url: base64Image } });
  }
  const payload = {
    model: model || 'Qwen/Qwen2.5-VL-7B-Instruct',
    messages: [{ role: "user", content: contentParts }],
    max_tokens: 1000,
    temperature: 0.2
  };
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
  const response = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(payload), signal });
  const data = await response.json();
  return data.choices?.[0]?.message?.content?.trim() || "";
};

export const checkQualityQwen = async (
  apiKey: string,
  baseUrl: string,
  model: string,
  file: File,
  caption: string,
  videoFrameCount: number = 8,
  signal?: AbortSignal
): Promise<number> => {
  let endpoint = baseUrl;
  if (!endpoint.includes('/chat/completions')) endpoint = endpoint.replace(/\/+$/, '') + '/chat/completions';
  const prompt = `Evaluate the caption quality. Respond with ONLY an integer from 1 to 5.\nCaption: "${caption}"`;
  let contentParts: any[] = [{ type: "text", text: prompt }];
  if (file.type.startsWith('video/')) {
    const frames = await extractFramesFromVideo(file, 4);
    frames.forEach(frame => contentParts.push({ type: "image_url", image_url: { url: frame } }));
  } else {
    const base64Image = await fileToBase64(file);
    contentParts.push({ type: "image_url", image_url: { url: base64Image } });
  }
  const payload = {
    model: model || 'Qwen/Qwen2.5-VL-7B-Instruct',
    messages: [{ role: "user", content: contentParts }],
    max_tokens: 10,
    temperature: 0.1
  };
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
  const response = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify(payload), signal });
  const data = await response.json();
  const text = data.choices?.[0]?.message?.content?.trim();
  return parseInt(text?.match(/\d+/)?.[0] || '0', 10);
};