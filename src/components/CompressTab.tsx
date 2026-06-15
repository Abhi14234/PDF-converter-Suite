import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Percent, UploadCloud, FileText, CheckCircle2, 
  AlertCircle, Loader2, Cpu, Sliders, Sparkles, TrendingDown 
} from 'lucide-react';
import { UploadedFile, CompressionSettings } from '../types';
import { compressAndResizePdf, autoCompressWithKbLimit } from '../utils/pdfTools';

interface CompressTabProps {
  onSuccess: (filename: string, originalSize: number, newSize: number, tool: 'compress') => void;
}

export default function CompressTab({ onSuccess }: CompressTabProps) {
  const [file, setFile] = useState<UploadedFile | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState('');
  
  // Terminal logs for auto optimizer feedback
  const [optimizerLogs, setOptimizerLogs] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Compression Parameters
  const [mode, setMode] = useState<'smart' | 'manual'>('smart');
  const [targetSizeKb, setTargetSizeKb] = useState<number>(500); // 500KB is very common for standard forms
  const [qualitySlider, setQualitySlider] = useState<number>(75); // 75%
  const [resolutionSlider, setResolutionSlider] = useState<number>(85); // 85%

  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const loadPdfDocument = async (selectedFile: File) => {
    setErrorMsg(null);
    setFile(null);
    setOptimizerLogs([]);
    setIsProcessing(true);
    setProcessingStatus('Analyzing document size metadata...');

    try {
      setFile({
        id: `compress-${Date.now()}`,
        file: selectedFile,
        name: selectedFile.name,
        size: selectedFile.size,
        type: 'pdf',
        extension: 'pdf',
      });
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Error occurred while staging document.');
    } finally {
      setIsProcessing(false);
      setProcessingStatus('');
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFile = e.dataTransfer.files[0];
      const ext = droppedFile.name.split('.').pop()?.toLowerCase() || '';
      if (ext !== 'pdf') {
        setErrorMsg('The compressor tool accepts PDF documents only.');
        return;
      }
      await loadPdfDocument(droppedFile);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await loadPdfDocument(e.target.files[0]);
    }
  };

  const handleCompressExecution = async () => {
    if (!file) return;

    setIsProcessing(true);
    setOptimizerLogs([]);
    setErrorMsg(null);

    try {
      const rawBytes = new Uint8Array(await file.file.arrayBuffer());
      let outputBytes: Uint8Array;
      let finalSizeKb = 0;

      if (mode === 'smart') {
        const result = await autoCompressWithKbLimit(
          rawBytes,
          targetSizeKb,
          (msg) => {
            setProcessingStatus(msg);
            setOptimizerLogs(prev => [...prev, msg]);
          }
        );
        outputBytes = result.bytes;
        finalSizeKb = result.finalSizeKb;
      } else {
        // Manual mode
        setProcessingStatus('Lowering page resolutions and exporting compressed indexes...');
        const qualityDecimal = qualitySlider / 100;
        const scaleDecimal = resolutionSlider / 100;
        
        outputBytes = await compressAndResizePdf(rawBytes, qualityDecimal, scaleDecimal, (progress) => {
          setProcessingStatus(`Rendering pages and generating outputs: ${progress}%`);
        });
        finalSizeKb = outputBytes.length / 1024;
      }

      setProcessingStatus('Saving optimized PDF and updating metadata...');

      // Dynamic download flow
      const blob = new Blob([outputBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const outName = `${file.name.split('.')[0]}_compressed.pdf`;
      
      a.href = url;
      a.download = outName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      onSuccess(outName, file.size, outputBytes.length, 'compress');
      setFile(null); // Clear selected
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'An error occurred during PDF compression. Please ensure PDF is not encrypted.');
    } finally {
      setIsProcessing(false);
      setProcessingStatus('');
    }
  };

  return (
    <div id="compress-tool-container" className="space-y-6 px-1.5">
      <div className="flex justify-between items-center border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-xl font-display font-semibold text-slate-900 flex items-center gap-2">
            <Percent className="w-5 h-5 text-red-500" />
            Compress & Resize PDF
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Minify and downscale PDF page layers to fit email attachment or digital application portals size caps.
          </p>
        </div>
      </div>

      {!file && !isProcessing && (
        <div
          id="compress-dropzone"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-[32px] p-12 text-center cursor-pointer transition-all bg-gradient-to-b from-white to-slate-50 ${
            isDragging 
              ? 'drag-active border-red-500 bg-red-50/40 border-red-500' 
              : 'border-slate-300 hover:border-red-400'
          }`}
        >
          <input 
            id="compress-file-input"
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            accept=".pdf"
            className="hidden" 
          />
          <div className="flex flex-col items-center gap-3">
            <div className="w-20 h-20 bg-red-50 text-red-600 rounded-full flex items-center justify-center mb-2 animate-float">
              <UploadCloud className="w-10 h-10" />
            </div>
            <div>
              <p className="font-semibold text-slate-800 text-xl">Drop PDF file here to compress</p>
              <p className="text-sm text-slate-400 mt-2">
                Optimize any multi-page PDF document client-side • or <span className="text-red-550 hover:underline font-semibold">browse file</span>
              </p>
            </div>
            <div className="text-xs text-slate-400 mt-1 font-mono">
              Optimize any multi-page PDF document client-side.
            </div>
          </div>
        </div>
      )}

      {isProcessing && !file && (
        <div id="loading-box" className="flex flex-col items-center justify-center p-12 bg-white rounded-[32px] border border-slate-200 shadow-sm space-y-4">
          <Loader2 className="w-8 h-8 text-red-500 animate-spin" />
          <p className="text-sm font-semibold text-slate-850 font-mono text-center">
            {processingStatus}
          </p>
        </div>
      )}

      {errorMsg && (
        <div id="compress-error" className="flex items-start gap-2.5 p-3.5 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <div>{errorMsg}</div>
        </div>
      )}

      {file && (
        <motion.div
          id="compress-panel"
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="space-y-6"
        >
          {/* Active document card */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-11 bg-red-50 border border-red-100 rounded-lg flex items-center justify-center text-red-500 font-bold font-mono text-xs shadow-inner">
                PDF
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-slate-850 text-sm truncate">{file.name}</p>
                <div className="flex items-center gap-2 text-xs text-slate-400 font-mono mt-0.5">
                  <span className="text-slate-600 font-semibold bg-slate-100 px-1.5 py-0.5 rounded">ORIGINAL SIZE: {formatBytes(file.size)}</span>
                </div>
              </div>
            </div>
            
            <button
              onClick={() => setFile(null)}
              className="text-xs font-semibold text-slate-500 hover:text-red-500 transition-colors py-1.5 px-3 rounded-md hover:bg-slate-100"
            >
              Choose different file
            </button>
          </div>

          {/* Compression controller dashboard */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Left Box: Quality Options */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <span className="text-xs font-semibold text-slate-500 font-mono">CHOOSE EXPORT MODE</span>
                <div className="flex bg-slate-100 p-1 rounded-lg gap-1 border">
                  <button
                    onClick={() => setMode('smart')}
                    className={`text-xs font-semibold px-2.5 py-1 rounded-md transition-all flex items-center gap-1 ${
                      mode === 'smart' 
                        ? 'bg-white text-red-600 shadow-sm font-bold' 
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <Cpu className="w-3.5 h-3.5" />
                    Auto Optimizer
                  </button>
                  <button
                    onClick={() => setMode('manual')}
                    className={`text-xs font-semibold px-2.5 py-1 rounded-md transition-all flex items-center gap-1 ${
                      mode === 'manual' 
                        ? 'bg-white text-red-600 shadow-sm font-bold' 
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    <Sliders className="w-3.5 h-3.5" />
                    Manual
                  </button>
                </div>
              </div>

              {mode === 'smart' ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-xs text-red-600 font-semibold bg-red-50 border border-red-100 p-3 rounded-xl">
                    <Sparkles className="w-4 h-4 shrink-0" />
                    <span>
                      Smart optimizer automatically calculates resolution scales and quality factors to shrink files under your requested size guidelines.
                    </span>
                  </div>

                  <div>
                    <label htmlFor="compaction-guideline-size" className="block text-xs font-semibold text-slate-500 font-mono mb-2">
                      PORTAL / UPLOAD TARGET SIZE GUIDELINE limit
                    </label>
                    <div className="flex items-center gap-2">
                      <input 
                        id="compaction-guideline-size"
                        type="number"
                        min="50"
                        max="51200"
                        step="50"
                        value={targetSizeKb}
                        onChange={(e) => setTargetSizeKb(Math.max(50, parseInt(e.target.value) || 500))}
                        className="bg-slate-100 rounded-lg p-2.5 border border-slate-200 text-sm font-semibold font-mono w-36 focus:outline-none focus:ring-1 focus:ring-red-500 focus:bg-white"
                      />
                      <span className="text-sm font-semibold text-slate-600 font-mono">KB</span>
                      <span className="text-xs text-slate-400 font-mono">({(targetSizeKb / 1024).toFixed(1)} MB)</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-3 pt-2">
                       <button 
                         onClick={() => setTargetSizeKb(250)}
                         className={`text-[10px] font-mono px-2 py-1 rounded border transition-colors ${targetSizeKb === 250 ? 'bg-red-600 text-white border-red-600' : 'bg-slate-50 hover:bg-slate-100'}`}
                       >
                         250 KB (Low-Res)
                       </button>
                       <button 
                         onClick={() => setTargetSizeKb(500)}
                         className={`text-[10px] font-mono px-2 py-1 rounded border transition-colors ${targetSizeKb === 500 ? 'bg-red-600 text-white border-red-600' : 'bg-slate-50 hover:bg-slate-100'}`}
                       >
                         500 KB (Govt Portals)
                       </button>
                       <button 
                         onClick={() => setTargetSizeKb(1000)}
                         className={`text-[10px] font-mono px-2 py-1 rounded border transition-colors ${targetSizeKb === 1000 ? 'bg-red-600 text-white border-red-600' : 'bg-slate-50 hover:bg-slate-100'}`}
                       >
                         1 MB (Standard)
                       </button>
                       <button 
                         onClick={() => setTargetSizeKb(2000)}
                         className={`text-[10px] font-mono px-2 py-1 rounded border transition-colors ${targetSizeKb === 2000 ? 'bg-red-600 text-white border-red-600' : 'bg-slate-50 hover:bg-slate-100'}`}
                       >
                         2 MB (High quality)
                       </button>
                     </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Quality factor manual slider */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-xs text-slate-500 font-mono">
                      <span>IMAGE COMPRESSION FACTOR</span>
                      <span className="font-semibold text-red-600">{qualitySlider}%</span>
                    </div>
                    <input 
                      id="quality-slider"
                      type="range"
                      min="10"
                      max="100"
                      value={qualitySlider}
                      onChange={(e) => setQualitySlider(parseInt(e.target.value))}
                      className="w-full h-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg appearance-none cursor-pointer accent-red-500 outline-none"
                    />
                    <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                      <span>High compression (10%)</span>
                      <span>No compression (100%)</span>
                    </div>
                  </div>

                  {/* Resolution scale manual slider */}
                  <div className="space-y-2 pt-2 border-t border-slate-100 font-sans">
                    <div className="flex justify-between items-center text-xs text-slate-500 font-mono">
                      <span>RESOLUTION SCALE (DPI)</span>
                      <span className="font-semibold text-red-600">{resolutionSlider}%</span>
                    </div>
                    <input 
                      id="resolution-slider"
                      type="range"
                      min="30"
                      max="150"
                      value={resolutionSlider}
                      onChange={(e) => setResolutionSlider(parseInt(e.target.value))}
                      className="w-full h-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg appearance-none cursor-pointer accent-red-500 outline-none"
                    />
                    <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                      <span>Downscale (30%)</span>
                      <span>Full scale (150%)</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="pt-3 border-t border-slate-100 font-sans">
                {isProcessing ? (
                  <div className="p-3 bg-red-50 border rounded-lg space-y-2">
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 text-red-500 animate-spin" />
                      <span className="text-xs font-medium text-slate-700 font-mono">
                        {processingStatus}
                      </span>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={handleCompressExecution}
                    className="w-full py-3 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white text-sm font-semibold rounded-xl flex items-center justify-center gap-2 shadow transition-all active:scale-95"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Compress PDF Document
                  </button>
                )}
              </div>
            </div>

            {/* Right Box: Live Optimizer Logs Terminal */}
            <div className="bg-slate-900 text-red-400 p-4 rounded-xl shadow-md flex flex-col justify-between shrink-0 font-mono text-xs min-h-[220px] max-h-[340px] relative overflow-hidden border border-slate-800">
              <div className="absolute top-2 right-3 flex items-center gap-1.5 text-[9px] text-slate-400 select-none bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse-slow"></div>
                SYSTEM CONSOLE
              </div>
              
              <div className="flex-1 overflow-y-auto space-y-2.5 pr-2 pt-3 custom-scrollbar" id="optimizer-logs-terminal">
                <span className="block text-slate-500 tracking-wider font-semibold uppercase text-[10px] border-b border-slate-800 pb-1 flex items-center gap-1">
                  <TrendingDown className="w-3.5 h-3.5" />
                  Execution Pass Logs 
                </span>
                
                {optimizerLogs.length === 0 ? (
                  <div className="text-slate-500 italic flex flex-col items-center justify-center h-32 select-none">
                    <span>Logs of the compression system will appear here during runtime optimization passes.</span>
                  </div>
                ) : (
                  optimizerLogs.map((log, idx) => (
                    <motion.div 
                      key={`log-${idx}`}
                      initial={{ opacity: 0, x: -5 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="leading-relaxed whitespace-pre-wrap"
                    >
                      <span className="text-slate-500 select-none mr-2">[{new Date().toLocaleTimeString()}]</span>
                      <span className="text-slate-300">{log}</span>
                    </motion.div>
                  ))
                )}
              </div>
              <div className="text-[10px] text-slate-500 border-t border-slate-800/80 pt-2 selection:bg-transparent select-none">
                Compressor v3.11 • Core client runtime active.
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
