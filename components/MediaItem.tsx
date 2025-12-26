import React from 'react';
import type { MediaFile } from '../types';
import { GenerationStatus } from '../types';
import { SparklesIcon, LoaderIcon, WandIcon, CheckCircleIcon } from './Icons';

interface MediaItemProps {
  item: MediaFile;
  autofit: boolean;
  isApiKeySet: boolean;
  isComfyEnabled: boolean;
  showSideBySidePreview: boolean;
  onGenerate: (id: string, customInstructions?: string) => void;
  onCheckQuality: (id: string) => void;
  onPreview: (id: string) => void;
  onCaptionChange: (id:string, caption: string) => void;
  onCustomInstructionsChange: (id: string, instructions: string) => void;
  onSelectionChange: (id: string, isSelected: boolean) => void;
  onOpenPreviewModal: (id: string) => void;
}

const getScoreColor = (score?: number) => {
    if (score === undefined) return 'text-gray-500';
    if (score >= 4) return 'text-green-400';
    if (score >= 3) return 'text-yellow-400';
    return 'text-red-400';
};


const MediaItem: React.FC<MediaItemProps> = ({ 
    item, 
    autofit,
    isApiKeySet,
    isComfyEnabled,
    showSideBySidePreview,
    onGenerate, 
    onCheckQuality,
    onPreview,
    onCaptionChange,
    onCustomInstructionsChange,
    onSelectionChange,
    onOpenPreviewModal
}) => {
  const isVideo = item.file.type.startsWith('video/');
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    if (textareaRef.current && autofit) {
        textareaRef.current.style.height = 'auto'; // Reset height
        textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    } else if (textareaRef.current) {
        textareaRef.current.style.height = ''; // Revert to CSS-defined height
    }
  }, [item.caption, autofit]);

  const getStatusColor = () => {
    switch(item.status) {
      case GenerationStatus.SUCCESS: return 'border-green-500';
      case GenerationStatus.ERROR: return 'border-red-500';
      case GenerationStatus.GENERATING: return 'border-indigo-500';
      case GenerationStatus.CHECKING: return 'border-yellow-500';
      default: return 'border-gray-700';
    }
  };
  
  const isProcessing = item.status === GenerationStatus.GENERATING || item.status === GenerationStatus.CHECKING;
  const isPreviewing = item.comfyStatus === 'generating';
  const hasPreview = !!item.comfyPreviewUrl;

  const renderMedia = (url: string, isOriginal: boolean) => {
    const isVideoFile = isOriginal && isVideo;
    return (
        <div className="relative flex-1 bg-gray-900 rounded-md overflow-hidden flex flex-col group/media shadow-inner cursor-pointer" onClick={() => onOpenPreviewModal(item.id)}>
            <div className="flex-grow flex items-center justify-center min-h-[160px] h-full">
                {isVideoFile ? (
                    <video src={url} className="max-w-full max-h-full object-contain" />
                ) : (
                    <img src={url} alt={item.file.name} className="max-w-full max-h-full object-contain" />
                )}
            </div>
            <div className="absolute bottom-1 left-1 px-1.5 py-0.5 bg-black/60 backdrop-blur-sm rounded text-[9px] font-black uppercase tracking-widest text-white/90 border border-white/10 opacity-80 pointer-events-none">
                {isOriginal ? 'Original' : 'Preview'}
            </div>
        </div>
    );
  };

  return (
    <div className={`bg-gray-800 rounded-lg overflow-hidden border-2 transition-all ${getStatusColor()}`}>
      <div className="relative p-2 space-y-2">
         <input
          type="checkbox"
          checked={item.isSelected}
          onChange={(e) => onSelectionChange(item.id, e.target.checked)}
          className="absolute top-4 left-4 h-6 w-6 bg-gray-900/80 backdrop-blur-sm border-gray-600 text-indigo-500 rounded focus:ring-indigo-600 z-10 cursor-pointer shadow-lg"
        />
        {item.qualityScore !== undefined && (
            <div className="absolute top-4 right-4 bg-gray-900/70 backdrop-blur-sm px-3 py-1 rounded-full text-sm font-semibold flex items-center gap-1.5 z-10 shadow-sm border border-white/5">
                <span className={`tracking-widest ${getScoreColor(item.qualityScore)}`}>
                    {'★'.repeat(item.qualityScore)}{'☆'.repeat(5 - item.qualityScore)}
                </span>
                <span className="text-gray-300 text-[10px]">{item.qualityScore}/5</span>
            </div>
        )}

        {hasPreview && !showSideBySidePreview && (
            <button 
                onClick={() => onOpenPreviewModal(item.id)}
                className="absolute bottom-4 right-4 bg-orange-600 hover:bg-orange-500 text-white px-3 py-1.5 rounded-md text-[10px] font-black uppercase tracking-wider z-10 shadow-xl transition-all hover:scale-105 active:scale-95 border border-white/10"
            >
                View Comparison
            </button>
        )}

        <div className={`h-64 flex gap-2 ${showSideBySidePreview && hasPreview ? 'flex-row' : 'flex-col'}`}>
            {showSideBySidePreview && hasPreview ? (
                <>
                    {renderMedia(item.previewUrl, true)}
                    {renderMedia(item.comfyPreviewUrl!, false)}
                </>
            ) : (
                <div 
                    className="flex-grow flex items-center justify-center bg-gray-900 rounded-md overflow-hidden relative group/single cursor-pointer"
                    onClick={() => onOpenPreviewModal(item.id)}
                >
                    {isVideo ? (
                        <video src={item.previewUrl} className="max-w-full max-h-full object-contain" />
                    ) : (
                        <img src={item.previewUrl} alt={item.file.name} className="max-w-full max-h-full object-contain" />
                    )}
                    <div className="absolute inset-0 bg-black/0 group-hover/single:bg-black/20 transition-colors flex items-center justify-center">
                        <SparklesIcon className="w-8 h-8 text-white opacity-0 group-hover/single:opacity-100 transition-all scale-75 group-hover/single:scale-100" />
                    </div>
                </div>
            )}
        </div>
      </div>

      <div className="p-4 space-y-4">
        <div className="flex justify-between items-start gap-2">
            <p className="text-sm text-gray-400 truncate flex-grow font-mono" title={item.file.name}>{item.file.name}</p>
            <span className="text-[10px] text-gray-600 font-bold uppercase tracking-widest whitespace-nowrap">
                {isVideo ? 'Video' : 'Image'}
            </span>
        </div>
        
        <textarea
            ref={textareaRef}
            value={item.caption}
            onChange={(e) => onCaptionChange(item.id, e.target.value)}
            placeholder="Generated caption will appear here..."
            rows={!autofit ? 6 : 1}
            className={`w-full p-2.5 bg-gray-900 border border-gray-700 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all resize-none overflow-hidden text-[13px] leading-relaxed text-gray-200 ${!autofit ? 'h-32' : ''}`}
        />

        <div className="flex flex-col gap-2">
            <input 
                type="text"
                placeholder="Custom instructions for refinement..."
                value={item.customInstructions}
                onChange={(e) => onCustomInstructionsChange(item.id, e.target.value)}
                className="w-full p-2.5 bg-gray-700 border border-gray-600 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all text-xs"
            />
            <div className="flex flex-wrap gap-2">
                <button
                    onClick={() => onGenerate(item.id, item.customInstructions)}
                    disabled={isProcessing || !isApiKeySet}
                    className="flex-1 flex items-center justify-center px-3 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-700 disabled:cursor-not-allowed transition-all text-[11px] font-black uppercase tracking-wider shadow-lg shadow-green-900/10"
                >
                    {isProcessing ? (
                        <LoaderIcon className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                        item.customInstructions ? <WandIcon className="w-4 h-4 mr-2" /> : <SparklesIcon className="w-4 h-4 mr-2" />
                    )}
                    <span>
                        {item.status === GenerationStatus.GENERATING ? 'Working...' :
                         item.status === GenerationStatus.CHECKING ? 'Checking...' :
                         item.customInstructions ? 'Refine' : 'Generate'}
                    </span>
                </button>

                <button
                    onClick={() => onCheckQuality(item.id)}
                    disabled={isProcessing || !isApiKeySet || !item.caption}
                    className="flex-1 flex items-center justify-center px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed transition-all text-[11px] font-black uppercase tracking-wider shadow-lg shadow-blue-900/10"
                >
                    <CheckCircleIcon className="w-4 h-4 mr-2" />
                    <span>Check Quality</span>
                </button>

                {isComfyEnabled && (
                    <button
                        onClick={() => onPreview(item.id)}
                        disabled={isPreviewing || !item.caption}
                        className={`flex-shrink-0 flex items-center justify-center px-4 py-2 text-white rounded-md transition-all text-[11px] font-black uppercase tracking-wider shadow-lg ${item.comfyStatus === 'error' ? 'bg-red-600 hover:bg-red-700 shadow-red-900/10' : 'bg-orange-600 hover:bg-orange-700 shadow-orange-900/10'} disabled:bg-gray-500 disabled:cursor-not-allowed`}
                        title={item.comfyErrorMessage || "Generate preview with ComfyUI"}
                    >
                        {isPreviewing ? (
                            <LoaderIcon className="w-4 h-4 animate-spin mr-2" />
                        ) : (
                            <SparklesIcon className="w-4 h-4 mr-2" />
                        )}
                        <span>Preview</span>
                    </button>
                )}
            </div>
            
            {isComfyEnabled && item.comfyStatus === 'error' && (
                <div className="bg-red-900/20 p-2 rounded border border-red-500/30">
                    <p className="text-[10px] text-red-400 leading-tight">
                        <span className="font-bold uppercase tracking-tighter">Bridge/Server Error:</span> {item.comfyErrorMessage}
                    </p>
                </div>
            )}
            {isComfyEnabled && item.comfyStatus === 'generating' && (
                <div className="bg-orange-900/20 p-2 rounded border border-orange-500/30 animate-pulse">
                    <p className="text-[10px] text-orange-400 font-bold uppercase text-center tracking-widest">
                        Queueing in ComfyUI...
                    </p>
                </div>
            )}
        </div>
        
        {item.status === GenerationStatus.ERROR && (
          <p className="text-[11px] text-red-400 mt-1 italic font-medium leading-tight">
              <span className="font-black uppercase tracking-tighter mr-1">Error:</span> {item.errorMessage}
          </p>
        )}
      </div>
    </div>
  );
};

export default MediaItem;