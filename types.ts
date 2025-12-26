
export enum GenerationStatus {
  IDLE = 'idle',
  GENERATING = 'generating',
  CHECKING = 'checking',
  SUCCESS = 'success',
  ERROR = 'error',
}

export interface MediaFile {
  id: string;
  file: File;
  previewUrl: string;
  caption: string;
  status: GenerationStatus;
  errorMessage?: string;
  isSelected: boolean;
  customInstructions: string;
  qualityScore?: number;
  // ComfyUI Preview fields
  comfyPreviewUrl?: string;
  comfyStatus?: 'idle' | 'generating' | 'success' | 'error';
  comfyErrorMessage?: string;
}