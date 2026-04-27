
/**
 * Service for interacting with OpenRouter API.
 */

const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to convert file to base64'));
      }
    };
    reader.onerror = error => reject(error);
  });
};

const extractFramesFromVideo = async (videoFile: File, numberOfFrames: number, signal?: AbortSignal): Promise<string[]> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    const url = URL.createObjectURL(videoFile);
    const frames: string[] = [];
    
    const onAbort = () => {
        URL.revokeObjectURL(url);
        video.src = "";
        reject(new Error("AbortError"));
    };
    if (signal) signal.addEventListener('abort', onAbort);

    const timeout = setTimeout(() => {
        if (signal) signal.removeEventListener('abort', onAbort);
        URL.revokeObjectURL(url);
        video.src = "";
        reject(new Error("Video processing timed out"));
    }, 60000);

    video.onloadeddata = async () => {
        const duration = video.duration;
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            if (signal) signal.removeEventListener('abort', onAbort);
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
                if (signal?.aborted) throw new Error("AbortError");
                const time = (step * i) + (step / 2);
                await new Promise<void>((frameResolve) => {
                    const onSeeked = () => {
                        video.removeEventListener('seeked', onSeeked);
                        frameResolve();
                    };
                    video.addEventListener('seeked', onSeeked);
                    video.currentTime = Math.min(time, duration - 0.1);
                });
                ctx.drawImage(video, 0, 0);
                frames.push(canvas.toDataURL('image/jpeg', 0.8));
            }
            if (signal) signal.removeEventListener('abort', onAbort);
            clearTimeout(timeout);
            URL.revokeObjectURL(url);
            video.src = "";
            resolve(frames);
        } catch (e) {
            if (signal) signal.removeEventListener('abort', onAbort);
            clearTimeout(timeout);
            URL.revokeObjectURL(url);
            reject(e);
        }
    };
    video.onerror = () => {
        if (signal) signal.removeEventListener('abort', onAbort);
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
4. DO NOT mention art styles or generic animation terms like "anime" or "cartoon".
5. Write as a single, continuous paragraph.`;

  if (isCharacterTaggingEnabled && characterShowName && characterShowName.trim() !== '') {
    basePrompt += `\n6. Identify characters from the show/series "${characterShowName}" and append tags at the end of the caption, separated by commas. The format for each tag must be "char_[charactername]" (e.g., ", char_simon, char_kamina"). If no characters are recognized, do not add tags.`;
  }

  if (customInstructions) {
    return `${basePrompt}\n\nAdditional instructions: ${customInstructions}`;
  }
  return basePrompt;
};

export const generateCaptionOpenRouter = async (
  apiKey: string,
  model: string,
  file: File,
  triggerWord: string,
  customInstructions?: string,
  isCharacterTaggingEnabled?: boolean,
  characterShowName?: string,
  videoFrameCount: number = 8,
  maxTokens: number = 4096,
  temperature: number = 0.7,
  useFullVideo: boolean = false,
  signal?: AbortSignal
): Promise<string> => {
  if (!apiKey) throw new Error("OpenRouter API Key is required.");
  const endpoint = 'https://openrouter.ai/api/v1/chat/completions';
  const prompt = constructPrompt(triggerWord, customInstructions, isCharacterTaggingEnabled, characterShowName);
  
  // Extract model ID from URL if provided
  let modelId = model.includes('openrouter.ai/') ? model.split('openrouter.ai/').pop() || '' : model;
  // Handle /models/ prefix if it exists in the URL
  if (modelId.startsWith('models/')) {
    modelId = modelId.replace('models/', '');
  }
  // Remove any trailing slashes or query params
  modelId = modelId.split('?')[0].replace(/\/+$/, '');

  let contentParts: any[] = [{ type: "text", text: prompt }];
  if (file.type.startsWith('video/')) {
    if (useFullVideo) {
      const base64Video = await fileToBase64(file);
      contentParts.push({ type: "image_url", image_url: { url: base64Video } });
    } else {
      const frames = await extractFramesFromVideo(file, videoFrameCount, signal);
      frames.forEach(frame => contentParts.push({ type: "image_url", image_url: { url: frame } }));
    }
  } else {
    const base64Image = await fileToBase64(file);
    contentParts.push({ type: "image_url", image_url: { url: base64Image } });
  }

  const payload = {
    model: modelId || 'openai/gpt-4o-mini',
    messages: [{ role: "user", content: contentParts }],
    max_tokens: maxTokens,
    temperature: temperature
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
      "HTTP-Referer": window.location.origin,
      "X-Title": "LoRA Caption Assistant"
    },
    body: JSON.stringify(payload),
    signal
  });

  if (!response.ok) {
    let errorMessage = response.statusText;
    try {
      const errData = await response.json();
      errorMessage = errData.error?.message || errData.message || JSON.stringify(errData) || errorMessage;
    } catch (e) {
      const errText = await response.text().catch(() => "");
      if (errText) errorMessage = errText;
    }
    throw new Error(`OpenRouter API Error (${response.status}): ${errorMessage}`);
  }

  const data = await response.json();
  console.log('OpenRouter Generate Response:', data);
  const message = data.choices?.[0]?.message;
  let content = "";
  
  if (message) {
    if (typeof message.content === 'string') {
      content = message.content.trim();
    } else if (Array.isArray(message.content)) {
      // Handle cases where content might be returned as an array of parts
      content = message.content
        .filter((part: any) => part.type === 'text')
        .map((part: any) => part.text)
        .join('\n')
        .trim();
    }
  }

  const refusal = message?.refusal;
  const reasoning = message?.reasoning;
  const finishReason = data.choices?.[0]?.finish_reason;
  
  if (!content && refusal) {
    throw new Error(`OpenRouter Refusal: ${refusal}`);
  }
  
  if (!content && finishReason === 'length') {
    if (reasoning) {
        // If we only have reasoning and it hit the length limit, the model likely 
        // spent all tokens "thinking" and never got to the output.
        throw new Error("OpenRouter model hit token limit during reasoning. Try increasing max tokens or using a non-reasoning model.");
    }
    throw new Error("OpenRouter response was cut off (hit token limit).");
  }

  if (!content && finishReason === 'content_filter') {
    throw new Error("OpenRouter response was blocked by content filter.");
  }
  
  // Some models might put the result in reasoning if content is null, 
  // though rare for standard chat completions.
  return content || (reasoning ? `[Reasoning Only]: ${reasoning}` : "");
};

export const refineCaptionOpenRouter = async (
  apiKey: string,
  model: string,
  file: File,
  currentCaption: string,
  refinementInstructions: string,
  videoFrameCount: number = 4,
  maxTokens: number = 4096,
  temperature: number = 0.7,
  useFullVideo: boolean = false,
  signal?: AbortSignal
): Promise<string> => {
  if (!apiKey) throw new Error("OpenRouter API Key is required.");
  const endpoint = 'https://openrouter.ai/api/v1/chat/completions';
  const prompt = `Refine the following caption based on the visual information and the instructions. Output ONLY the refined text.
CURRENT CAPTION: "${currentCaption}"
INSTRUCTIONS: "${refinementInstructions}"`;

  let modelId = model.includes('openrouter.ai/') ? model.split('openrouter.ai/').pop() || '' : model;
  if (modelId.startsWith('models/')) modelId = modelId.replace('models/', '');
  modelId = modelId.split('?')[0].replace(/\/+$/, '');

  let contentParts: any[] = [{ type: "text", text: prompt }];
  if (file.type.startsWith('video/')) {
    if (useFullVideo) {
      const base64Video = await fileToBase64(file);
      contentParts.push({ type: "image_url", image_url: { url: base64Video } });
    } else {
      const frames = await extractFramesFromVideo(file, videoFrameCount, signal);
      frames.forEach(frame => contentParts.push({ type: "image_url", image_url: { url: frame } }));
    }
  } else {
    const base64Image = await fileToBase64(file);
    contentParts.push({ type: "image_url", image_url: { url: base64Image } });
  }

  const payload = {
    model: modelId || 'openai/gpt-4o-mini',
    messages: [{ role: "user", content: contentParts }],
    max_tokens: maxTokens,
    temperature: temperature
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
      "HTTP-Referer": window.location.origin,
      "X-Title": "LoRA Caption Assistant"
    },
    body: JSON.stringify(payload),
    signal
  });

  if (!response.ok) {
    let errorMessage = response.statusText;
    try {
      const errData = await response.json();
      errorMessage = errData.error?.message || errData.message || JSON.stringify(errData) || errorMessage;
    } catch (e) {
      const errText = await response.text().catch(() => "");
      if (errText) errorMessage = errText;
    }
    throw new Error(`OpenRouter API Error (${response.status}): ${errorMessage}`);
  }
  const data = await response.json();
  console.log('OpenRouter Refine Response:', data);
  const content = data.choices?.[0]?.message?.content?.trim();
  const refusal = data.choices?.[0]?.message?.refusal;
  if (!content && refusal) throw new Error(`OpenRouter Refusal: ${refusal}`);
  return content || "";
};

export const checkQualityOpenRouter = async (
  apiKey: string,
  model: string,
  file: File,
  caption: string,
  videoFrameCount: number = 4,
  temperature: number = 0.7,
  useFullVideo: boolean = false,
  signal?: AbortSignal
): Promise<number> => {
  if (!apiKey) throw new Error("OpenRouter API Key is required.");
  const endpoint = 'https://openrouter.ai/api/v1/chat/completions';
  const prompt = `Evaluate the caption quality. Respond with ONLY an integer from 1 to 5.\nCaption: "${caption}"`;

  let modelId = model.includes('openrouter.ai/') ? model.split('openrouter.ai/').pop() || '' : model;
  if (modelId.startsWith('models/')) modelId = modelId.replace('models/', '');
  modelId = modelId.split('?')[0].replace(/\/+$/, '');

  let contentParts: any[] = [{ type: "text", text: prompt }];
  if (file.type.startsWith('video/')) {
    if (useFullVideo) {
      const base64Video = await fileToBase64(file);
      contentParts.push({ type: "image_url", image_url: { url: base64Video } });
    } else {
      const frames = await extractFramesFromVideo(file, videoFrameCount, signal);
      frames.forEach(frame => contentParts.push({ type: "image_url", image_url: { url: frame } }));
    }
  } else {
    const base64Image = await fileToBase64(file);
    contentParts.push({ type: "image_url", image_url: { url: base64Image } });
  }

  const payload = {
    model: modelId || 'openai/gpt-4o-mini',
    messages: [{ role: "user", content: contentParts }],
    max_tokens: 10,
    temperature: temperature
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
      "HTTP-Referer": window.location.origin,
      "X-Title": "LoRA Caption Assistant"
    },
    body: JSON.stringify(payload),
    signal
  });

  if (!response.ok) {
    let errorMessage = response.statusText;
    try {
      const errData = await response.json();
      errorMessage = errData.error?.message || errData.message || JSON.stringify(errData) || errorMessage;
    } catch (e) {
      const errText = await response.text().catch(() => "");
      if (errText) errorMessage = errText;
    }
    throw new Error(`OpenRouter API Error (${response.status}): ${errorMessage}`);
  }
  const data = await response.json();
  console.log('OpenRouter Quality Response:', data);
  const text = data.choices?.[0]?.message?.content?.trim();
  const refusal = data.choices?.[0]?.message?.refusal;
  if (!text && refusal) throw new Error(`OpenRouter Refusal: ${refusal}`);
  return parseInt(text?.match(/\d+/)?.[0] || '0', 10);
};
