import { GoogleGenAI, GenerateContentResponse } from "@google/genai";

const withRetry = async <T>(
  apiCall: () => Promise<T>,
  maxRetries: number = 3,
  initialDelay: number = 1000
): Promise<T> => {
  let attempt = 0;
  while (true) {
    try {
      return await apiCall();
    } catch (error) {
      attempt++;
      if (
        error instanceof Error &&
        (error.message.includes("503") || error.message.toLowerCase().includes("overloaded")) &&
        attempt < maxRetries
      ) {
        const delay = initialDelay * Math.pow(2, attempt - 1) + Math.random() * 500;
        console.warn(`Attempt ${attempt} failed. Retrying in ${delay.toFixed(0)}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw error;
      }
    }
  }
};

const fileToGenerativePart = async (file: File) => {
  const base64EncodedDataPromise = new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result.split(',')[1]);
      }
    };
    reader.readAsDataURL(file);
  });
  return {
    inlineData: { data: await base64EncodedDataPromise, mimeType: file.type },
  };
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

  if (isCharacterTaggingEnabled && characterShowName) {
    basePrompt += `\n6. Identify characters from the show/series "${characterShowName}" and append tags at the end of the caption, separated by commas. The format for each tag must be "char_[charactername]" (e.g., ", char_simon, char_kamina"). If no characters are recognized, do not add tags.`;
  }

  if (customInstructions) {
    return `${basePrompt}\n\nAdditional instructions: ${customInstructions}`;
  }
  return basePrompt;
};

export const generateCaption = async (
  file: File,
  triggerWord: string,
  customInstructions?: string,
  isCharacterTaggingEnabled?: boolean,
  characterShowName?: string,
  signal?: AbortSignal,
  apiKeyOverride?: string,
  model: string = 'gemini-3-pro-preview'
): Promise<string> => {
  const apiKey = apiKeyOverride || process.env.API_KEY;
  if (!apiKey) throw new Error("API Key is missing. Please enter your Gemini API key in the Global Settings.");

  const ai = new GoogleGenAI({ apiKey });
  const imagePart = await fileToGenerativePart(file);
  const prompt = constructPrompt(triggerWord, customInstructions, isCharacterTaggingEnabled, characterShowName);

  const apiCall = () => ai.models.generateContent({
    model: model,
    contents: { parts: [imagePart, { text: prompt }] },
    config: { signal } as any
  });

  const response: GenerateContentResponse = await withRetry(apiCall);
  
  if (signal?.aborted) throw new Error("AbortError");

  if (response.text) {
    return response.text.trim();
  }
  throw new Error("No caption text returned from Gemini.");
};

export const refineCaption = async (
  file: File,
  currentCaption: string,
  refinementInstructions: string,
  signal?: AbortSignal,
  apiKeyOverride?: string,
  model: string = 'gemini-3-pro-preview'
): Promise<string> => {
  const apiKey = apiKeyOverride || process.env.API_KEY;
  if (!apiKey) throw new Error("API Key is missing.");

  const ai = new GoogleGenAI({ apiKey });
  const imagePart = await fileToGenerativePart(file);
  const prompt = `You are an expert editor for LoRA training data. 
Refine the provided caption based on the visual information and the user's refinement instructions. 
Maintain the continuous paragraph format and ensure the trigger word is preserved.

CURRENT CAPTION: "${currentCaption}"
REFINEMENT INSTRUCTIONS: "${refinementInstructions}"

Output only the refined caption.`;

  const apiCall = () => ai.models.generateContent({
    model: model,
    contents: { parts: [imagePart, { text: prompt }] },
    config: { signal } as any
  });

  const response: GenerateContentResponse = await withRetry(apiCall);
  if (signal?.aborted) throw new Error("AbortError");

  if (response.text) {
    return response.text.trim();
  }
  throw new Error("No refined text returned.");
};

export const checkCaptionQuality = async (
  file: File,
  caption: string,
  signal?: AbortSignal,
  apiKeyOverride?: string,
  model: string = 'gemini-3-pro-preview'
): Promise<number> => {
  const apiKey = apiKeyOverride || process.env.API_KEY;
  if (!apiKey) throw new Error("API Key is missing.");

  const ai = new GoogleGenAI({ apiKey });
  const imagePart = await fileToGenerativePart(file);
  const prompt = `Evaluate the following caption for accuracy and detail based on the image. Respond with ONLY an integer from 1 to 5.\nCaption: "${caption}"`;

  try {
    const apiCall = () => ai.models.generateContent({
        model: model,
        contents: { parts: [imagePart, { text: prompt }] },
        config: { signal } as any
    });
    const response: GenerateContentResponse = await withRetry(apiCall);
    const scoreText = response.text?.trim() || '0';
    const score = parseInt(scoreText.match(/\d+/)?.[0] || '0', 10);
    return score;
  } catch (error) {
    console.error("Quality check failed:", error);
    return 0;
  }
};