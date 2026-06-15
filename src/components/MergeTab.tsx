import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  FileText, Image as ImageIcon, FileCode, Trash2, ArrowUp, ArrowDown, 
  UploadCloud, FilePlus2, CheckCircle2, AlertCircle, Loader2, Sparkles 
} from 'lucide-react';
import { UploadedFile } from '../types';
import { 
  convertImageToPdfBytes, 
  convertDocxToPdfBytes, 
  mergePdfs, 
  getPdfPageCount, 
  autoCompressWithKbLimit 
} from '../utils/pdfTools';

interface MergeTabProps {
  onSuccess: (filename: string, originalSize: number, newSize: number, tool: 'merge') => void;
}

export default function MergeTab({ onSuccess }: MergeTabProps) {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  // Size-constraint settings
  const [limitSize, setLimitSize] = useState(false);
  const [targetSizeKb, setTargetSizeKb] = useState<number>(1024); // default 1MB (1024KB)

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Helper to format bytes
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = 2;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const processFiles = async (fileList: FileList) => {
    setErrorMsg(null);
    const newUploadedFiles: UploadedFile[] = [];

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      
      let type: UploadedFile['type'] = 'unsupported';
      let previewUrl: string | undefined = undefined;

      if (ext === 'pdf') {
        type = 'pdf';
      } else if (ext === 'docx') {
        type = 'docx';
      } else if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
        type = 'image';
        previewUrl = URL.createObjectURL(file);
      }

      if (type === 'unsupported') {
        setErrorMsg(`Format ".${ext}" is not supported. Please upload PDFs, Word (.docx), or images (.jpg, .png, .webp).`);
        continue;
      }

      newUploadedFiles.push({
        id: `${file.name}-${Date.now()}-${i}`,
        file,
        name: file.name,
        size: file.size,
        type,
        extension: ext,
        previewUrl,
        isProcessing: false
      });
    }

    setFiles(prev => [...prev, ...newUploadedFiles]);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await processFiles(e.dataTransfer.files);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await processFiles(e.target.files);
    }
  };

  const handleRemoveFile = (id: string) => {
    setFiles(prev => {
      const target = prev.find(f => f.id === id);
      if (target?.previewUrl) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter(f => f.id !== id);
    });
  };

  const moveFile = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === files.length - 1) return;

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const reordered = [...files];
    const temp = reordered[index];
    reordered[index] = reordered[targetIndex];
    reordered[targetIndex] = temp;
    setFiles(reordered);
  };

  const handleClearAll = () => {
    files.forEach(f => {
      if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
    });
    setFiles([]);
    setErrorMsg(null);
  };

  const handleMergeAndConvert = async () => {
    if (files.length === 0) {
      setErrorMsg('Please upload at least one file to merge/convert.');
      return;
    }

    setIsProcessing(true);
    setProcessingStatus('Reading and preparing documents...');
    setErrorMsg(null);

    try {
      const pdfByteBuffers: Uint8Array[] = [];
      let totalInputSize = 0;

      for (let i = 0; i < files.length; i++) {
        const fileObj = files[i];
        totalInputSize += fileObj.size;
        
        // Update styling of files list to show which file is processing
        setFiles(prev => prev.map(f => f.id === fileObj.id ? { ...f, isProcessing: true } : f));
        setProcessingStatus(`Converting file ${i + 1}/${files.length}: ${fileObj.name}...`);

        let pdfBytes: Uint8Array;

        if (fileObj.type === 'pdf') {
          // It's already a PDF, read it as base arrayBuffer
          pdfBytes = new Uint8Array(await fileObj.file.arrayBuffer());
        } else if (fileObj.type === 'image') {
          // Convert JPG/PNG/WebP to PDF pages
          pdfBytes = await convertImageToPdfBytes(fileObj.file);
        } else if (fileObj.type === 'docx') {
          // Convert docx text to PDF
          pdfBytes = await convertDocxToPdfBytes(fileObj.file);
        } else {
          throw new Error(`Unsupported file layout detected: ${fileObj.name}`);
        }

        pdfByteBuffers.push(pdfBytes);
        
        // Remove processing state
        setFiles(prev => prev.map(f => f.id === fileObj.id ? { ...f, isProcessing: false } : f));
      }

      setProcessingStatus('Stitching all individual components together...');
      let mergedBytes = await mergePdfs(pdfByteBuffers);
      const originalMergedSize = mergedBytes.length;

      // Handle custom size constraint optimization if user toggled it
      if (limitSize && targetSizeKb > 0) {
        setProcessingStatus(`Analyzing file size. Target size is max ${targetSizeKb}KB...`);
        const optimizationResult = await autoCompressWithKbLimit(
          mergedBytes,
          targetSizeKb,
          (message) => setProcessingStatus(message)
        );
        mergedBytes = optimizationResult.bytes;
      }

      setProcessingStatus('Saving final outputs and updating triggers...');

      // Create download trigger
      const blob = new Blob([mergedBytes], { type: 'application/pdf' });
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const standardName = files.length > 1 
        ? `merged_${files[0].name.split('.')[0]}_and_others.pdf`
        : `${files[0].name.split('.')[0]}_converted.pdf`;
      
      a.href = downloadUrl;
      a.download = standardName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);

      onSuccess(standardName, totalInputSize, mergedBytes.length, 'merge');
      handleClearAll();
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'An unexpected error occurred during processing. Please verify and try again.');
      // clear processing states
      setFiles(prev => prev.map(f => ({ ...f, isProcessing: false })));
    } finally {
      setIsProcessing(false);
      setProcessingStatus('');
    }
  };

  return (
    <div id="merge-tool-container" className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-xl font-display font-semibold text-slate-900 flex items-center gap-2">
            <FilePlus2 className="w-5 h-5 text-red-500" />
            Convert & Merge
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Drag-and-drop Word documents, pictures, and PDFs to compile a clean, unified document.
          </p>
        </div>
        {files.length > 0 && (
          <button 
            id="clear-all-merge-button"
            onClick={handleClearAll}
            disabled={isProcessing}
            className="text-xs font-semibold text-red-600 hover:text-red-700 transition-colors bg-red-50 hover:bg-red-100/50 py-1.5 px-3 rounded-lg"
          >
            Clear Selected ({files.length})
          </button>
        )}
      </div>

      {/* Drag & Drop Main Zone */}
      <div
        id="merge-dropzone"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-[32px] p-12 text-center cursor-pointer transition-all bg-gradient-to-b from-white to-slate-50 ${
          isDragging 
            ? 'drag-active border-red-500 bg-red-50/40' 
            : 'border-slate-300 hover:border-red-400'
        }`}
      >
        <input 
          id="merge-file-input"
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          multiple
          accept=".pdf,.docx,.jpg,.jpeg,.png,.webp"
          className="hidden" 
        />
        <div className="flex flex-col items-center gap-3">
          <div className="w-20 h-20 bg-red-50 text-red-600 rounded-full flex items-center justify-center mb-2 animate-float">
            <UploadCloud className="w-10 h-10" />
          </div>
          <div>
            <p className="font-semibold text-slate-800 text-xl">Drop your files here</p>
            <p className="text-sm text-slate-400 mt-2">
              Supports PDF, DOCX, JPG, and PNG files • or <span className="text-red-600 hover:underline font-semibold">browse files</span>
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-slate-400 mt-2 font-mono">
            <span>• PDF documents</span>
            <span>• Word (.docx)</span>
            <span>• Images (JPG, PNG, WebP)</span>
          </div>
        </div>
      </div>

      {errorMsg && (
        <div id="merge-error" className="flex items-start gap-2.5 p-3.5 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <div>{errorMsg}</div>
        </div>
      )}

      {/* Files List Panel */}
      <AnimatePresence>
        {files.length > 0 && (
          <motion.div
            id="merge-files-list"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-4"
          >
            <div className="flex justify-between items-center bg-slate-100 py-2 px-3 rounded-lg text-xs font-semibold text-slate-600">
              <span>MANAGE SEQUENCE ({files.length} FILES)</span>
              <span>DRAG OR TAP ARROWS TO RE-ORDER</span>
            </div>

            <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl bg-white overflow-hidden shadow-sm">
              {files.map((fileObj, index) => {
                const isPdf = fileObj.type === 'pdf';
                const isImg = fileObj.type === 'image';
                const isDoc = fileObj.type === 'docx';

                return (
                  <motion.div
                    key={fileObj.id}
                    layoutId={fileObj.id}
                    className={`flex items-center justify-between p-3.5 hover:bg-slate-50/50 transition-colors relative ${
                      fileObj.isProcessing ? 'bg-red-50/30' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3.5 min-w-0 flex-1">
                      {/* Left Thumbnail indicator */}
                      <div className="w-12 h-12 bg-slate-100 rounded-lg flex items-center justify-center shrink-0 border border-slate-200 overflow-hidden relative shadow-inner">
                        {isPdf && <div className="text-[10px] font-bold text-red-600 font-display">PDF</div>}
                        {isDoc && <FileText className="w-6 h-6 text-blue-600" />}
                        {isImg && fileObj.previewUrl ? (
                          <img 
                            src={fileObj.previewUrl} 
                            alt={fileObj.name} 
                            className="w-full h-full object-cover" 
                            referrerPolicy="no-referrer"
                          />
                        ) : isImg && (
                          <ImageIcon className="w-6 h-6 text-indigo-500" />
                        )}
                        {fileObj.isProcessing && (
                          <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
                            <Loader2 className="w-5 h-5 text-red-500 animate-spin" />
                          </div>
                        )}
                      </div>
                      
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-slate-800 text-sm truncate">{fileObj.name}</p>
                          {/* Type tags */}
                          {isPdf && <span className="text-[10px] bg-red-50 text-red-600 px-1.5 py-0.5 rounded-md font-mono border border-red-100 font-medium">PDF</span>}
                          {isDoc && <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-md font-mono border border-blue-100 font-medium">DOCX</span>}
                          {isImg && <span className="text-[10px] bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded-md font-mono border border-indigo-100 font-medium">IMAGE</span>}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-slate-400 font-mono mt-0.5">
                          <span>{formatBytes(fileObj.size)}</span>
                          <span>•</span>
                          <span>Position {index + 1}</span>
                        </div>
                      </div>
                    </div>

                    {/* Action buttons on the right */}
                    <div className="flex items-center gap-1.5 shrink-0 pl-4">
                      {/* Move Up */}
                      <button
                        id={`move-up-${index}`}
                        disabled={index === 0 || isProcessing}
                        onClick={() => moveFile(index, 'up')}
                        title="Move Up"
                        className="p-1 px-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent rounded"
                      >
                        <ArrowUp className="w-4 h-4" />
                      </button>
                      {/* Move Down */}
                      <button
                        id={`move-down-${index}`}
                        disabled={index === files.length - 1 || isProcessing}
                        onClick={() => moveFile(index, 'down')}
                        title="Move Down"
                        className="p-1 px-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent rounded"
                      >
                        <ArrowDown className="w-4 h-4" />
                      </button>
                      {/* Remove */}
                      <button
                        id={`remove-${index}`}
                        disabled={isProcessing}
                        onClick={() => handleRemoveFile(fileObj.id)}
                        title="Delete file"
                        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors ml-1"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {/* Custom Guidelines Optimization Drawer */}
            <div id="size-guideline-drawer" className="bg-slate-100/70 hover:bg-slate-100 transition-colors p-4 rounded-xl border border-slate-200">
              <div className="flex items-start gap-3">
                <input 
                  id="limit-size-checkbox"
                  type="checkbox"
                  checked={limitSize}
                  onChange={(e) => setLimitSize(e.target.checked)}
                  disabled={isProcessing}
                  className="w-4 h-4 text-red-500 border-slate-300 rounded focus:ring-red-400 mt-1"
                />
                <div className="flex-1">
                  <label htmlFor="limit-size-checkbox" className="font-semibold text-slate-900 text-sm flex items-center gap-1.5 cursor-pointer selection:bg-transparent select-none">
                    Optimize file size to meet strict upload guidelines
                    <Sparkles className="w-3.5 h-3.5 text-red-500 fill-red-500/10" />
                  </label>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Forms or applications often have upload size constraints (e.g. max 1MB or 2MB). Turn this on to automatically fit guidelines.
                  </p>
                  
                  {limitSize && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-slate-200/50"
                    >
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1 font-mono">
                          MAXIMUM FILE SIZE
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            id="max-size-input"
                            type="number"
                            min="100"
                            max="10240"
                            step="50"
                            value={targetSizeKb}
                            onChange={(e) => setTargetSizeKb(Math.max(100, parseInt(e.target.value) || 1024))}
                            className="bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm w-32 focus:ring-1 focus:ring-red-500 font-mono focus:outline-none"
                          />
                          <span className="text-sm font-semibold text-slate-500 font-mono">KB</span>
                          <span className="text-xs text-slate-400 font-mono">({(targetSizeKb / 1024).toFixed(1)} MB)</span>
                        </div>
                      </div>
                      <div className="flex items-center text-xs text-slate-500 bg-red-50/40 border border-red-100 p-2.5 rounded-lg">
                        <span>
                          <strong>Note:</strong> We will automatically run multiple passes of variable resolutions and image factors to ensure the final document stays strictly below this limit while preserving letter-crisp vector typography.
                        </span>
                      </div>
                    </motion.div>
                  )}
                </div>
              </div>
            </div>

            {/* Processing and trigger states */}
            <div id="merge-action-pannel" className="pt-2 flex flex-col items-center">
              {isProcessing ? (
                <div id="processing-loader" className="w-full space-y-3 p-4 bg-red-50 border border-red-100 rounded-xl">
                  <div className="flex items-center gap-3">
                    <Loader2 className="w-5 h-5 text-red-600 animate-spin shrink-0" />
                    <span className="text-sm font-medium text-slate-850 font-mono">{processingStatus}</span>
                  </div>
                  {/* Subtle bar simulator */}
                  <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                    <div className="bg-red-600 h-full animate-pulse-slow w-[80%] rounded-full"></div>
                  </div>
                </div>
              ) : (
                <button
                  id="merge-action-trigger"
                  onClick={handleMergeAndConvert}
                  className="w-full py-4 text-center text-white bg-red-600 hover:bg-red-700 active:scale-95 rounded-2xl font-bold tracking-tight shadow-lg shadow-red-100 hover:shadow-xl hover:shadow-red-200/50 transition-all flex items-center justify-center gap-2 text-base"
                >
                  <CheckCircle2 className="w-5 h-5" />
                  Generate PDF
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
