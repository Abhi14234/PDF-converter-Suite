import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  FileText, Layers, Scissors, Percent, Sparkles, 
  History, Download, ArrowRight, CheckCircle2, Award, Info,
  Crop
} from 'lucide-react';

import { ToolType, HistoryOperation } from './types';

// Lazy load tool tabs to split the large bundle and maximize initial page speed (Google Core Web Vitals)
const MergeTab = React.lazy(() => import('./components/MergeTab'));
const SplitTab = React.lazy(() => import('./components/SplitTab'));
const CompressTab = React.lazy(() => import('./components/CompressTab'));
const PhotoConverterTab = React.lazy(() => import('./components/PhotoConverterTab'));

export default function App() {
  const [activeTab, setActiveTab] = useState<ToolType>('merge');
  const [history, setHistory] = useState<HistoryOperation[]>([]);
  
  // Successful operation notification state
  const [lastOperation, setLastOperation] = useState<{
    filename: string;
    originalSize: number;
    newSize: number;
    tool: ToolType;
  } | null>(null);

  // FAQ accordion open index for SEO section
  const [faqOpenIndex, setFaqOpenIndex] = useState<number | null>(null);

  // Load history from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('pdf_converter_ops_history');
      if (saved) {
        // Parse dates correctly
        const parsed = JSON.parse(saved).map((h: any) => ({
          ...h,
          timestamp: new Date(h.timestamp)
        }));
        setHistory(parsed);
      }
    } catch (err) {
      console.error('Failed to load history:', err);
    }
  }, []);

  // Save history to localStorage
  const saveHistory = (newHistory: HistoryOperation[]) => {
    setHistory(newHistory);
    try {
      localStorage.setItem('pdf_converter_ops_history', JSON.stringify(newHistory));
    } catch (err) {
      console.error('Failed to save history:', err);
    }
  };

  const handleOperationSuccess = (
    filename: string, 
    originalSize: number, 
    newSize: number, 
    tool: ToolType
  ) => {
    // Show success banner
    setLastOperation({ filename, originalSize, newSize, tool });
    
    // Add to history list
    const newOp: HistoryOperation = {
      id: `${Date.now()}-${Math.random()}`,
      timestamp: new Date(),
      tool,
      inputFiles: [filename],
      outputName: filename,
      outputSize: newSize,
      savedSize: originalSize > newSize ? originalSize - newSize : undefined
    };

    const updatedHistory = [newOp, ...history].slice(0, 10); // keep last 10 entries
    saveHistory(updatedHistory);

    // Auto dismiss success banner after 12 seconds
    setTimeout(() => {
      setLastOperation(prev => prev?.filename === filename ? null : prev);
    }, 12000);
  };

  const clearHistory = () => {
    saveHistory([]);
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const dm = 1;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  const calculateCumulativeSavings = () => {
    return history.reduce((acc, h) => acc + (h.savedSize || 0), 0);
  };

  return (
    <div id="pdf-application-root" className="min-h-screen bg-slate-50 gradient-bg pb-16 font-sans text-slate-800 antialiased selection:bg-red-500/10">
      
      {/* Decorative background grids */}
      <div className="absolute top-0 left-0 right-0 h-[400px] bg-gradient-to-b from-red-50/30 to-transparent pointer-events-none z-0" />
      
      {/* Header Bar */}
      <header id="app-bar" className="relative z-10 w-full max-w-5xl mx-auto px-4 pt-8 pb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-10 bg-red-600 rounded-lg flex items-center justify-center text-white font-display font-bold text-lg shadow-md hover:scale-105 transition-transform">
            P
          </div>
          <div>
            <h1 className="text-xl font-sans font-semibold tracking-tight text-slate-900 flex items-center gap-1.5 select-none">
              PDF<span className="text-red-600 font-bold">Flow</span>
              <span className="text-[10px] uppercase font-mono tracking-wider text-red-600 bg-red-50 border border-red-100 px-2 py-0.5 rounded-full font-bold">Suite</span>
            </h1>
            <p className="text-xs text-slate-500 font-medium font-sans">Safe processing in-sandbox • No files sent to servers</p>
          </div>
        </div>

        {/* Global Stats Tag */}
        {history.length > 0 && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="hidden sm:flex items-center gap-2 bg-red-50 border border-red-100 text-red-600 py-1.5 px-3 rounded-lg text-xs font-semibold font-mono"
          >
            <Award className="w-3.5 h-3.5" />
            Saved {formatBytes(calculateCumulativeSavings())} Space
          </motion.div>
        )}
      </header>

      {/* Main Container */}
      <main className="relative z-10 w-full max-w-5xl mx-auto px-4 mt-2 space-y-6">
        
        {/* Dynamic Success Toast Drawer */}
        <AnimatePresence>
          {lastOperation && (
            <motion.div
              id="success-toast"
              initial={{ opacity: 0, y: -20, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={{ opacity: 0, y: -20, height: 0 }}
              className="overflow-hidden"
            >
              <div className="bg-slate-900 text-white p-4 rounded-2xl shadow-lg border border-slate-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 relative">
                <div className="flex items-start sm:items-center gap-3.5">
                  <div className="bg-red-500/10 p-2.5 rounded-full shrink-0">
                    <CheckCircle2 className="w-6 h-6 text-red-500" />
                  </div>
                  <div>
                    <h3 className="font-sans font-semibold text-base text-white">Conversion Succeeded!</h3>
                    <p className="text-xs text-slate-300 font-mono mt-0.5 truncate max-w-md sm:max-w-lg">
                      Generated: <strong>{lastOperation.filename}</strong>
                    </p>
                    <div className="flex items-center gap-3 text-xs font-mono mt-1 text-slate-400">
                      <span>Compressed Size: {formatBytes(lastOperation.newSize)}</span>
                      {lastOperation.originalSize > lastOperation.newSize && (
                        <>
                          <span>•</span>
                          <span className="bg-red-500/20 px-1.5 py-0.5 rounded text-red-400 flex items-center gap-1.5 font-semibold">
                            Saved {Math.round((1 - lastOperation.newSize / lastOperation.originalSize) * 100)}% Space
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                  <button
                    onClick={() => setLastOperation(null)}
                    className="text-xs font-semibold bg-red-600 hover:bg-red-700 active:bg-red-800 transition-all text-white py-1.5 px-3 rounded-lg border border-red-500"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Workspace Card Grid */}
        <div id="tool-workspace" className="bg-white border border-slate-200 rounded-[32px] shadow-xl shadow-slate-200/50 overflow-hidden flex flex-col min-h-[500px]">
          
          {/* Tabs Navigation Strip */}
          <nav id="tool-navigator-strip" className="border-b border-slate-200 bg-slate-50/50 p-2 grid grid-cols-2 md:grid-cols-4 gap-1">
            
            {/* Tab: Merge tool */}
            <button
              id="tab-merge-trigger"
              onClick={() => { setActiveTab('merge'); setErrorMsg?.(null); }}
              className={`flex flex-col sm:flex-row items-center justify-center gap-1.5 sm:gap-2.5 py-3 rounded-xl transition-all font-sans text-xs sm:text-sm selection:bg-transparent select-none cursor-pointer ${
                activeTab === 'merge'
                  ? 'bg-red-50 text-red-600 border border-red-100 shadow-sm font-bold'
                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
              }`}
            >
              <Layers className={`w-4 h-4 shrink-0 transition-all ${activeTab === 'merge' ? 'text-red-500' : 'text-slate-400'}`} />
              <div className="text-center sm:text-left">
                <span className="block leading-tight font-semibold">Convert & Merge</span>
                <span className="hidden sm:block text-[10px] text-slate-400 font-sans mt-0.5">Stitch DOCX, Images, PDFs</span>
              </div>
            </button>

            {/* Tab: Split tool */}
            <button
              id="tab-split-trigger"
              onClick={() => { setActiveTab('split'); setErrorMsg?.(null); }}
              className={`flex flex-col sm:flex-row items-center justify-center gap-1.5 sm:gap-2.5 py-3 rounded-xl transition-all font-sans text-xs sm:text-sm selection:bg-transparent select-none cursor-pointer ${
                activeTab === 'split'
                  ? 'bg-red-50 text-red-655 border border-red-100 shadow-sm font-bold'
                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
              }`}
            >
              <Scissors className={`w-4 h-4 shrink-0 transition-all ${activeTab === 'split' ? 'text-red-500' : 'text-slate-400'}`} />
              <div className="text-center sm:text-left">
                <span className="block leading-tight font-semibold">Split Ranges</span>
                <span className="hidden sm:block text-[10px] text-slate-400 font-sans mt-0.5">Isolate page segments</span>
              </div>
            </button>

            {/* Tab: Compress tool */}
            <button
              id="tab-compress-trigger"
              onClick={() => { setActiveTab('compress'); setErrorMsg?.(null); }}
              className={`flex flex-col sm:flex-row items-center justify-center gap-1.5 sm:gap-2.5 py-3 rounded-xl transition-all font-sans text-xs sm:text-sm selection:bg-transparent select-none cursor-pointer ${
                activeTab === 'compress'
                  ? 'bg-red-50 text-red-655 border border-red-100 shadow-sm font-bold'
                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
              }`}
            >
              <Percent className={`w-4 h-4 shrink-0 transition-all ${activeTab === 'compress' ? 'text-red-500' : 'text-slate-400'}`} />
              <div className="text-center sm:text-left">
                <span className="block leading-tight font-semibold">Fit Upload limits</span>
                <span className="hidden sm:block text-[10px] text-slate-400 font-sans mt-0.5">Compress & Resize to KB</span>
              </div>
            </button>

            {/* Tab: Photo tool */}
            <button
              id="tab-photo-trigger"
              onClick={() => { setActiveTab('photo'); setErrorMsg?.(null); }}
              className={`flex flex-col sm:flex-row items-center justify-center gap-1.5 sm:gap-2.5 py-3 rounded-xl transition-all font-sans text-xs sm:text-sm selection:bg-transparent select-none cursor-pointer ${
                activeTab === 'photo'
                  ? 'bg-red-50 text-red-655 border border-red-100 shadow-sm font-bold'
                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
              }`}
            >
              <Crop className={`w-4 h-4 shrink-0 transition-all ${activeTab === 'photo' ? 'text-red-550' : 'text-slate-400'}`} />
              <div className="text-center sm:text-left">
                <span className="block leading-tight font-semibold">Photo & Signature</span>
                <span className="hidden sm:block text-[10px] text-slate-400 font-sans mt-0.5">Govt portal optimizer</span>
              </div>
            </button>

          </nav>

          {/* Tab Content Canvas with motion routing transitions */}
          <div className="p-6 sm:p-8 flex-1">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, x: 15 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -15 }}
                transition={{ duration: 0.18 }}
                className="h-full"
              >
                <React.Suspense fallback={
                  <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                    <div className="w-8 h-8 border-4 border-red-600 border-t-transparent rounded-full animate-spin mb-3"></div>
                    <p className="text-sm font-medium font-sans">Loading workspace tools...</p>
                  </div>
                }>
                  {activeTab === 'merge' && <MergeTab onSuccess={handleOperationSuccess} />}
                  {activeTab === 'split' && <SplitTab onSuccess={handleOperationSuccess} />}
                  {activeTab === 'compress' && <CompressTab onSuccess={handleOperationSuccess} />}
                  {activeTab === 'photo' && <PhotoConverterTab onSuccess={handleOperationSuccess} />}
                </React.Suspense>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        {/* Visual Privacy Info Banner */}
        <div id="privacy-badge" className="bg-slate-100 rounded-2xl p-4 border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs text-slate-500 relative">
          <div className="flex items-start md:items-center gap-2.5">
            <Info className="w-5 h-5 text-slate-400 mt-0.5 md:mt-0 shrink-0" />
            <div>
              <strong>100% Secure Client-Side Engine:</strong> In strict alignment with privacy standards, zero files are uploaded to third-party databases. Every single action—extracting text from DOCX, scaling images, rendering PDF layers, or zip packaging—occurs strictly in-memory inside your local web browser. Your confidential records are perfectly private.
            </div>
          </div>
        </div>

        {/* State-of-the-Art Semantic SEO & FAQ Guide Section for Search Engine Rankings */}
        <section id="pdfflow-seo-resources" className="bg-white border border-slate-200 rounded-[32px] p-6 sm:p-8 space-y-6 shadow-sm">
          <div className="border-b border-sky-100 pb-5">
            <h2 className="text-xl sm:text-2xl font-display font-semibold text-slate-900 tracking-tight flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-red-500" />
              PDFFlow Knowledge Hub & Optimization Center
            </h2>
            <p className="text-sm text-slate-500 mt-1.5 leading-relaxed font-sans">
              Learn how to utilize our 100% online, local client-side tool to convert documents, merge PDF pages, secure records, and scale file sizes down under federal portal requirements.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Guide column 1: Educational rich SEO text */}
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-slate-50/50 border border-slate-100 space-y-2">
                <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-red-500 rounded-full"></span>
                  Why Choose Local Free PDF Converters?
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed font-sans">
                  Unlike traditional online tools that transmit private reports to remote clouds, PDFFlow relies entirely on HTML5, WebAssembly, and local browser-based execution. Your documents stay safe in your memory sandbox, making it impossible for network listeners to intercept confidential material.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50/50 border border-slate-100 space-y-2">
                <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-red-500 rounded-full"></span>
                  How to Compress PDFs accurately to 500KB or 1MB?
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed font-sans">
                  Government portals for visas, corporate registers, or tax reporting enforce strict upload size limits (usually 500KB or 1MB). Our smart compiler measures document data and recursively scales canvas dimensions and JPEG raster factors to seamlessly squeeze multi-page records directly beneath your target limit.
                </p>
              </div>
            </div>

            {/* Accordion column 2: Interactive Answers */}
            <div className="space-y-2.5">
              {[
                {
                  q: "How can I merge multiple PDFs, DOCX, and JPGs together?",
                  a: "Our PDF Merger supports instant on-the-fly client-side conversion. Simply drop mixed files (images like JPG/PNG, text sheets like DOCX, or direct PDFs) into the drag-drop bucket. The script automatically extracts high-fidelity elements and parses them page-by-page into a singular, unified vector PDF."
                },
                {
                  q: "Are my documents secure? Does PDFFlow upload files?",
                  a: "None. Zero files ever hit our server limits. All conversion engines, including DocxReader and canvas compressors, run inside your native browser runtime. You can even disconnect your internet entirely after launching the applet, and all functions will work 100% offline."
                },
                {
                  q: "How does the PDF splitter extract pages?",
                  a: "Under the Split segment, load your document and select whether you want to download a zip bundle of separate pages or extract unique ranges (e.g., Pages 1, 3-5). The underlying script parses selected page ranges and constructs a new optimized PDF container on-the-fly."
                },
                {
                  q: "Does My vector PDF text quality degrade when I compress?",
                  a: "No! Our compression algorithm isolates high-density raster elements (like embedded images or screenshots) to optimize them, while carefully maintaining PDF structural text pathways, vector graphs, and font shapes at maximum crispness."
                },
                {
                  q: "How does the Photo Converter fit images to government specifications?",
                  a: "Under the Photo & Signature tab, select your target country preset (e.g. US Visa, Indian Passport) or enter custom dimensions in cm, mm, inches, or pixels. Set the required DPI (typically 200 or 300 DPI) and set the file limit in KB. The tool auto-crops and applies high-speed binary quality compression on-the-fly to output the perfect image size."
                }
              ].map((faq, idx) => {
                const isOpen = faqOpenIndex === idx;
                return (
                  <div key={idx} className="border border-slate-150 rounded-xl overflow-hidden bg-slate-50/30">
                    <button
                      onClick={() => setFaqOpenIndex(isOpen ? null : idx)}
                      className="w-full text-left p-3.5 flex justify-between items-center bg-white hover:bg-slate-50 transition-colors focus:outline-none"
                    >
                      <span className="text-xs font-semibold text-slate-800 font-sans tracking-tight pr-4">
                        {faq.q}
                      </span>
                      <span className="text-[10px] uppercase font-mono tracking-wider font-bold text-red-500 px-1.5 py-0.5 rounded bg-red-50">
                        {isOpen ? "Close" : "Read"}
                      </span>
                    </button>
                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="border-t border-slate-100"
                        >
                          <p className="p-4 text-xs text-slate-500 leading-relaxed bg-white">
                            {faq.a}
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
            
          </div>
        </section>

        {/* Beautiful Recent Activity Timeline */}
        <AnimatePresence>
          {history.length > 0 && (
            <motion.div
              id="history-pannel"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-3"
            >
              <div className="flex justify-between items-center px-1">
                <h3 className="text-xs font-bold font-mono tracking-wider text-slate-500 uppercase flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5" />
                  Conversions completed in this session
                </h3>
                <button
                  id="flush-history-trigger"
                  onClick={clearHistory}
                  className="text-[10px] font-semibold text-red-500 hover:text-red-700 font-mono"
                >
                  Clear logs
                </button>
              </div>

              <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl bg-white overflow-hidden shadow-sm">
                {history.map((op) => {
                  const isMerge = op.tool === 'merge';
                  const isSplit = op.tool === 'split';
                  const isCompress = op.tool === 'compress';
                  const isPhoto = op.tool === 'photo';

                  return (
                    <div key={op.id} className="p-3.5 flex items-center justify-between hover:bg-slate-50/30 transition-colors">
                      <div className="flex items-center gap-3.5 min-w-0">
                        {/* Tool Identifier Icon Badge */}
                        <div className="p-2 rounded-xl border shrink-0 bg-red-50 border-red-100 text-red-700">
                          {isMerge && <Layers className="w-4 h-4 text-red-500" />}
                          {isSplit && <Scissors className="w-4 h-4 text-red-500" />}
                          {isCompress && <Percent className="w-4 h-4 text-red-500" />}
                          {isPhoto && <Crop className="w-4 h-4 text-red-500" />}
                        </div>

                        <div className="min-w-0">
                          <p className="font-semibold text-slate-700 text-sm truncate">{op.outputName}</p>
                          <div className="flex items-center gap-2.5 text-xs text-slate-400 font-mono mt-0.5">
                            <span className="text-slate-500 uppercase font-semibold text-[9px] tracking-wider px-1.5 py-0.5 rounded-full bg-slate-100 border font-sans">
                              {op.tool === 'merge' ? 'Merge Converted' : op.tool === 'split' ? 'Split File' : op.tool === 'compress' ? 'Compaction' : 'Photo Optimizer'}
                            </span>
                            <span>•</span>
                            <span>{formatBytes(op.outputSize)}</span>
                            {op.savedSize && (
                              <>
                                <span>•</span>
                                <span className="text-emerald-600 font-semibold">Saved {formatBytes(op.savedSize)}</span>
                              </>
                            )}
                            <span className="hidden sm:inline">•</span>
                            <span className="hidden sm:inline text-slate-300 font-sans">{op.timestamp.toLocaleTimeString()}</span>
                          </div>
                        </div>
                      </div>

                      {/* Info Badge Indicator */}
                      <span className="text-xs text-slate-400 shrink-0 select-none bg-slate-50 py-1 px-3 border border-slate-200 rounded-full font-medium font-sans">
                        ✓ Downloaded
                      </span>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </main>
    </div>
  );
}

// Minimal dummy trigger inside code to check error states if any
const setErrorMsg: ((msg: string | null) => void) | null = null;
