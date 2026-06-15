import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Scissors, UploadCloud, FileText, CheckCircle2, 
  AlertCircle, Loader2, Grid, Layers, Archive, HelpCircle 
} from 'lucide-react';
import JSZip from 'jszip';
import { UploadedFile } from '../types';
import { 
  getPdfPageCount, 
  getPdfPagesThumbnails, 
  splitPdf, 
  mergePdfs 
} from '../utils/pdfTools';

interface SplitTabProps {
  onSuccess: (filename: string, originalSize: number, newSize: number, tool: 'split') => void;
}

export default function SplitTab({ onSuccess }: SplitTabProps) {
  const [file, setFile] = useState<UploadedFile | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  // Splitting specifications
  const [selectedPages, setSelectedPages] = useState<number[]>([]); // 1-based indices
  const [rangeInput, setRangeInput] = useState('');
  const [outputMode, setOutputMode] = useState<'single' | 'zip'>('single'); // single pdf or zip of individual pdfs
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Parse custom string ranges like "1-3, 5, 7" and update selected pages
  const handleRangeInputBlur = () => {
    if (!file || !file.pageCount) return;
    
    setErrorMsg(null);
    if (!rangeInput.trim()) {
      setSelectedPages([]);
      return;
    }

    const pages = new Set<number>();
    const tokens = rangeInput.split(',');

    for (const token of tokens) {
      const cleanToken = token.trim();
      if (!cleanToken) continue;

      if (cleanToken.includes('-')) {
        const parts = cleanToken.split('-');
        const start = parseInt(parts[0].trim());
        const end = parseInt(parts[1].trim());

        if (isNaN(start) || isNaN(end) || start < 1 || end < start) {
          setErrorMsg(`Invalid range token syntax: "${cleanToken}"`);
          return;
        }

        const cappedStart = Math.min(start, file.pageCount);
        const cappedEnd = Math.min(end, file.pageCount);

        for (let p = cappedStart; p <= cappedEnd; p++) {
          pages.add(p);
        }
      } else {
        const singlePage = parseInt(cleanToken);
        if (isNaN(singlePage) || singlePage < 1) {
          setErrorMsg(`Invalid page number token: "${cleanToken}"`);
          return;
        }
        if (singlePage <= file.pageCount) {
          pages.add(singlePage);
        } else {
          setErrorMsg(`Page number ${singlePage} is out of document bounds (Max: ${file.pageCount})`);
        }
      }
    }

    const sortedPages = Array.from(pages).sort((a, b) => a - b);
    setSelectedPages(sortedPages);
  };

  // Synchronize string input textbox when checkbox state changes
  useEffect(() => {
    if (selectedPages.length === 0) {
      setRangeInput('');
      return;
    }

    // Convert numeric array [1,2,3,5,7,8] to range lists "1-3, 5, 7-8"
    const ranges: string[] = [];
    let start = selectedPages[0];
    let prev = start;

    for (let i = 1; i <= selectedPages.length; i++) {
      const current = selectedPages[i];
      if (current === prev + 1) {
        prev = current;
      } else {
        if (start === prev) {
          ranges.push(`${start}`);
        } else {
          ranges.push(`${start}-${prev}`);
        }
        start = current;
        prev = current;
      }
    }
    setRangeInput(ranges.join(', '));
  }, [selectedPages]);

  const togglePageSelection = (pageNum: number) => {
    setSelectedPages(prev => {
      if (prev.includes(pageNum)) {
        return prev.filter(p => p !== pageNum);
      } else {
        return [...prev, pageNum].sort((a,b) => a-b);
      }
    });
  };

  const selectAllPages = () => {
    if (!file || !file.pageCount) return;
    const all = Array.from({ length: file.pageCount }, (_, i) => i + 1);
    setSelectedPages(all);
  };

  const clearSelection = () => {
    setSelectedPages([]);
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
    setSelectedPages([]);
    setRangeInput('');
    setIsProcessing(true);
    setProcessingStatus('Parsing file structure and loading pages...');

    try {
      const bytes = new Uint8Array(await selectedFile.arrayBuffer());
      const pageCount = await getPdfPageCount(bytes);

      if (pageCount === 0) {
        throw new Error('This PDF has no valid pages to extract.');
      }

      setProcessingStatus(`Rendering visual previews for ${pageCount} pages...`);

      // Draw all page thumbnails in high fidelity canvas rendering
      const pages = await getPdfPagesThumbnails(bytes, (progress) => {
        setProcessingStatus(`Rendering visual previews: ${progress}%`);
      });

      setFile({
        id: `split-${Date.now()}`,
        file: selectedFile,
        name: selectedFile.name,
        size: selectedFile.size,
        type: 'pdf',
        extension: 'pdf',
        pageCount,
        pages
      });
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Failed to read PDF document. Please verify file integrity.');
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
        setErrorMsg('Split tool only accepts PDF documents.');
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

  const handleSplitExecution = async () => {
    if (!file || selectedPages.length === 0) return;

    setIsProcessing(true);
    setErrorMsg(null);

    try {
      const rawBytes = new Uint8Array(await file.file.arrayBuffer());
      
      // Determine logical subranges (consecutive sets or individual files)
      if (outputMode === 'single') {
        setProcessingStatus('Creating sub-PDF document with selected pages...');
        
        // Group all selected pages together into a single merged PDF output
        const ranges = selectedPages.map(p => ({ start: p, end: p }));
        const splittedPdfs = await splitPdf(rawBytes, ranges);
        
        // Merge individual byte arrays back to one output
        const unifiedPdfBytes = await mergePdfs(splittedPdfs.map(s => s.bytes));
        
        const blob = new Blob([unifiedPdfBytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const outName = `${file.name.split('.')[0]}_split_compilation.pdf`;
        
        a.href = url;
        a.download = outName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        onSuccess(outName, file.size, unifiedPdfBytes.length, 'split');
      } else {
        // Zip mode (export each selected page as an individual separate document)
        setProcessingStatus('Compiling zip archive of separate PDF pages...');
        
        const zip = new JSZip();
        for (const pageNum of selectedPages) {
          const splitResults = await splitPdf(rawBytes, [{ start: pageNum, end: pageNum }]);
          if (splitResults.length > 0) {
            zip.file(`page_${pageNum}.pdf`, splitResults[0].bytes);
          }
        }
        
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(zipBlob);
        const a = document.createElement('a');
        const outName = `${file.name.split('.')[0]}_extracted_pages.zip`;
        
        a.href = url;
        a.download = outName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        onSuccess(outName, file.size, zipBlob.size, 'split');
      }

      // Reset
      setFile(null);
      setSelectedPages([]);
      setRangeInput('');
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Failed to split PDF. Check parameters and try again.');
    } finally {
      setIsProcessing(false);
      setProcessingStatus('');
    }
  };

  const formatBytes = (bytes: number) => {
    const k = 1024;
    const dm = 2;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  return (
    <div id="split-tool-container" className="space-y-6">
      <div className="flex justify-between items-center border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-xl font-display font-semibold text-slate-900 flex items-center gap-2">
            <Scissors className="w-5 h-5 text-red-500" />
            Split & Extract Pages
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Isolate specific page ranges or download pages as separate individual documents.
          </p>
        </div>
      </div>

      {!file && !isProcessing && (
        <div
          id="split-dropzone"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-[32px] p-12 text-center cursor-pointer transition-all bg-gradient-to-b from-white to-slate-50 ${
            isDragging 
              ? 'drag-active border-red-550 bg-red-50/40 border-red-500' 
              : 'border-slate-300 hover:border-red-400'
          }`}
        >
          <input 
            id="split-file-input"
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
              <p className="font-semibold text-slate-800 text-xl">Drop your PDF document here</p>
              <p className="text-sm text-slate-400 mt-2">
                Accepts single multi-page PDF documents only • or <span className="text-red-500 hover:underline font-semibold">browse file</span>
              </p>
            </div>
            <div className="text-xs text-slate-400 mt-1 font-mono">
              Accepts single multi-page PDF documents only.
            </div>
          </div>
        </div>
      )}

      {isProcessing && !file && (
        <div id="splitting-loading-overlay" className="flex flex-col items-center justify-center p-12 bg-white rounded-[32px] border border-slate-200 shadow-sm space-y-4">
          <Loader2 className="w-8 h-8 text-red-500 animate-spin" />
          <p className="text-sm font-semibold text-slate-850 font-mono text-center">
            {processingStatus}
          </p>
          <div className="w-48 bg-slate-100 rounded-full h-1 overflow-hidden">
            <div className="bg-red-600 h-full animate-pulse-slow w-[70%]"></div>
          </div>
        </div>
      )}

      {errorMsg && (
        <div id="split-error" className="flex items-start gap-2.5 p-3.5 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <div>{errorMsg}</div>
        </div>
      )}

      {file && (
        <motion.div
          id="split-editor"
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="space-y-6"
        >
          {/* Active document summary card */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-11 bg-red-50 border border-red-100 rounded-lg flex items-center justify-center text-red-500">
                <FileText className="w-6 h-6" />
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-slate-850 text-sm truncate">{file.name}</p>
                <div className="flex items-center gap-2 text-xs text-slate-400 font-mono mt-0.5">
                  <span>{formatBytes(file.size)}</span>
                  <span>•</span>
                  <span className="text-slate-600 font-medium font-sans">{file.pageCount} pages total</span>
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

          {/* Range selection panel */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Split controls (Left col) */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-4 lg:col-span-1">
              <div>
                <label htmlFor="range-selection-input" className="block text-xs font-semibold text-slate-500 font-mono mb-1.5">
                  SELECT EXTRACT RANGE
                </label>
                <input 
                  id="range-selection-input"
                  type="text"
                  placeholder="e.g. 1-3, 5, 8"
                  value={rangeInput}
                  onChange={(e) => setRangeInput(e.target.value)}
                  onBlur={handleRangeInputBlur}
                  className="w-full bg-slate-50 focus:bg-white border border-slate-200 rounded-lg p-2.5 text-sm focus:ring-1 focus:ring-red-500 focus:outline-none font-mono"
                />
                <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
                  <HelpCircle className="w-3 h-3 text-slate-300" />
                  Press <kbd className="bg-slate-100 px-1 py-0.5 rounded text-[8px] font-mono border">Tab</kbd> or click outside to sync ranges above
                </p>
              </div>

              {/* Presets */}
              <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
                <button
                  onClick={selectAllPages}
                  className="text-xs font-semibold text-red-600 hover:bg-red-50 border border-red-100 py-1.5 px-2.5 rounded-lg transition-colors flex-1"
                >
                  Select All
                </button>
                <button
                  onClick={clearSelection}
                  className="text-xs font-semibold text-slate-650 hover:bg-slate-50 border border-slate-200 py-1.5 px-2.5 rounded-lg transition-colors flex-1"
                >
                  Clear All
                </button>
              </div>

              {/* Extraction target behavior settings */}
              <div className="pt-4 border-t border-slate-100 space-y-2.5 font-sans">
                <span className="block text-xs font-semibold text-slate-500 font-mono mb-1.5">
                  TARGET EXPORT METHOD
                </span>
                
                <label className="flex items-start gap-2.5 p-2 rounded-lg hover:bg-slate-50 cursor-pointer selection:bg-transparent">
                  <input 
                    type="radio"
                    name="output-mode"
                    checked={outputMode === 'single'}
                    onChange={() => setOutputMode('single')}
                    className="w-4 h-4 text-red-500 border-slate-300 mt-0.5 focus:ring-red-400 accent-red-600"
                  />
                  <div>
                    <span className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-red-500" />
                      Merge into one document
                    </span>
                    <span className="block text-[10px] text-slate-400 mt-0.5">
                      Outputs a single consolidated PDF of selected pages.
                    </span>
                  </div>
                </label>

                <label className="flex items-start gap-2.5 p-2 rounded-lg hover:bg-slate-50 cursor-pointer selection:bg-transparent">
                  <input 
                    type="radio"
                    name="output-mode"
                    checked={outputMode === 'zip'}
                    onChange={() => setOutputMode('zip')}
                    className="w-4 h-4 text-red-500 border-slate-300 mt-0.5 focus:ring-red-400 accent-red-600"
                  />
                  <div>
                    <span className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                      <Archive className="w-3.5 h-3.5 text-red-500" />
                      Export separate PDFs as ZIP
                    </span>
                    <span className="block text-[10px] text-slate-400 mt-0.5">
                      Packages each individual page as an independent document in a zip file.
                    </span>
                  </div>
                </label>
              </div>

              <div className="pt-2">
                {isProcessing ? (
                  <div className="space-y-2 p-3 bg-red-50 border border-red-100 rounded-lg">
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 text-red-600 animate-spin" />
                      <span className="text-xs font-medium text-slate-700 font-mono">{processingStatus}</span>
                    </div>
                  </div>
                ) : (
                  <button
                    disabled={selectedPages.length === 0}
                    onClick={handleSplitExecution}
                    className="w-full py-3 text-center text-white bg-red-600 hover:bg-red-700 disabled:bg-slate-100 disabled:text-slate-400 rounded-xl font-bold transition-all flex items-center justify-center gap-2 text-sm disabled:shadow-none shadow-md shadow-red-100 active:scale-95"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Extract {selectedPages.length} {selectedPages.length === 1 ? 'Page' : 'Pages'}
                  </button>
                )}
              </div>
            </div>

            {/* Pages Grid system (Right col) */}
            <div className="lg:col-span-2 space-y-3">
              <div className="flex justify-between items-center text-xs font-semibold text-slate-500 font-mono">
                <span className="flex items-center gap-1">
                  <Grid className="w-3.5 h-3.5 text-red-500" />
                  PAGES PREVIEW ({file.pageCount} PAGES)
                </span>
                <span>{selectedPages.length} pages selected</span>
              </div>

              <div id="pages-visual-scroller" className="border border-slate-200 rounded-[24px] bg-slate-100 p-4 max-h-[420px] overflow-y-auto grid grid-cols-2 sm:grid-cols-3 gap-3.5 shadow-inner">
                {file.pages?.map((thumbSrc, index) => {
                  const pageNum = index + 1;
                  const isSelected = selectedPages.includes(pageNum);

                  return (
                    <motion.div
                      id={`pcard-grid-${pageNum}`}
                      key={`page-${pageNum}`}
                      onClick={() => togglePageSelection(pageNum)}
                      whileHover={{ scale: 1.02 }}
                      className={`relative bg-white border p-1 rounded-2xl cursor-pointer select-none overflow-hidden transition-all shadow-sm flex flex-col items-center ${
                        isSelected 
                          ? 'border-red-500 shadow-md ring-2 ring-red-500/10' 
                          : 'border-slate-300/80 hover:border-slate-400'
                      }`}
                    >
                      {/* Checkbox badge on top right */}
                      <div className={`absolute top-2.5 right-2.5 w-6 h-6 rounded-full flex items-center justify-center border text-[10px] font-bold z-10 ${
                        isSelected 
                          ? 'bg-red-500 border-red-500 text-white' 
                          : 'bg-white/80 border-slate-300 text-slate-400'
                      }`}>
                        {isSelected ? '✓' : pageNum}
                      </div>

                      {/* Actual canvas page render render image */}
                      <div className="w-full aspect-[3/4] bg-slate-50 flex items-center justify-center overflow-hidden border-b border-slate-100 rounded-t-lg relative">
                        <img 
                          src={thumbSrc} 
                          alt={`Page ${pageNum} thumbnail`} 
                          className="max-h-full max-w-full object-contain" 
                          referrerPolicy="no-referrer"
                        />
                      </div>

                      {/* Bottom banner block */}
                      <div className="w-full py-2 px-3 text-center bg-slate-50 rounded-b-lg">
                        <span className="text-xs font-semibold text-slate-700 font-mono">Page {pageNum}</span>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
