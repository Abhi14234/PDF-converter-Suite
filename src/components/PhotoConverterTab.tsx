import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  UploadCloud, CheckCircle2, AlertCircle, Loader2, Sparkles, 
  Image as ImageIcon, Sliders, RotateCw, ZoomIn, ZoomOut, 
  Download, Crop, Info, Trash2, Check
} from 'lucide-react';
import { UploadedFile, ToolType } from '../types';

interface PhotoConverterTabProps {
  onSuccess: (
    filename: string, 
    originalSize: number, 
    newSize: number, 
    tool: ToolType
  ) => void;
}

interface PhotoPreset {
  name: string;
  description: string;
  width: number;
  height: number;
  unit: 'px' | 'cm' | 'mm' | 'inch';
  defaultKbLimit: number;
  defaultDpi: number;
}

const PRESETS: PhotoPreset[] = [
  {
    name: 'US Visa / Passport',
    description: '2 x 2 inches, max 240 KB',
    width: 2.0,
    height: 2.0,
    unit: 'inch',
    defaultKbLimit: 240,
    defaultDpi: 300,
  },
  {
    name: 'Indian Passport Photo',
    description: '3.5 x 3.5 cm, max 50 KB',
    width: 3.5,
    height: 3.5,
    unit: 'cm',
    defaultKbLimit: 50,
    defaultDpi: 300,
  },
  {
    name: 'Indian PAN Card Photo',
    description: '3.5 x 2.5 cm, max 50 KB',
    width: 3.5,
    height: 2.5,
    unit: 'cm',
    defaultKbLimit: 50,
    defaultDpi: 300,
  },
  {
    name: 'Indian PAN Card Signature',
    description: '4.5 x 2.0 cm, max 20 KB',
    width: 4.5,
    height: 2.0,
    unit: 'cm',
    defaultKbLimit: 20,
    defaultDpi: 300,
  },
  {
    name: 'UK / Schengen Visa',
    description: '3.5 x 4.5 cm, max 200 KB',
    width: 3.5,
    height: 4.5,
    unit: 'cm',
    defaultKbLimit: 200,
    defaultDpi: 300,
  },
  {
    name: 'Australian Passport',
    description: '3.5 x 4.5 cm, max 200 KB',
    width: 3.5,
    height: 4.5,
    unit: 'cm',
    defaultKbLimit: 200,
    defaultDpi: 300,
  },
];

export default function PhotoConverterTab({ onSuccess }: PhotoConverterTabProps) {
  const [file, setFile] = useState<UploadedFile | null>(null);
  const [imgElement, setImgElement] = useState<HTMLImageElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Settings
  const [selectedPreset, setSelectedPreset] = useState<string>(PRESETS[0].name);
  const [width, setWidth] = useState<number>(PRESETS[0].width);
  const [height, setHeight] = useState<number>(PRESETS[0].height);
  const [unit, setUnit] = useState<'px' | 'cm' | 'mm' | 'inch'>(PRESETS[0].unit);
  const [dpi, setDpi] = useState<number>(PRESETS[0].defaultDpi);
  const [limitSize, setLimitSize] = useState<boolean>(true);
  const [targetSizeKb, setTargetSizeKb] = useState<number>(PRESETS[0].defaultKbLimit);
  const [format, setFormat] = useState<'image/jpeg' | 'image/png'>('image/jpeg');

  // Adjustments
  const [zoom, setZoom] = useState<number>(1.0);
  const [rotate, setRotate] = useState<number>(0); // 0, 90, 180, 270
  const [panX, setPanX] = useState<number>(0); // -0.5 to 0.5
  const [panY, setPanY] = useState<number>(0); // -0.5 to 0.5
  const [brightness, setBrightness] = useState<number>(0); // -100 to 100
  const [contrast, setContrast] = useState<number>(0); // -100 to 100
  const [saturation, setSaturation] = useState<number>(0); // -100 to 100

  // Drag-to-pan state variables
  const [isPanning, setIsPanning] = useState(false);
  const startDragRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Load Preset
  const applyPreset = (presetName: string) => {
    setSelectedPreset(presetName);
    const preset = PRESETS.find(p => p.name === presetName);
    if (preset) {
      setWidth(preset.width);
      setHeight(preset.height);
      setUnit(preset.unit);
      setTargetSizeKb(preset.defaultKbLimit);
      setDpi(preset.defaultDpi);
    }
  };

  const handleCustomDimensionChange = (
    w: number, 
    h: number, 
    u: 'px' | 'cm' | 'mm' | 'inch'
  ) => {
    setSelectedPreset('custom');
    setWidth(w);
    setHeight(h);
    setUnit(u);
  };

  // Convert physical unit to pixel dimensions
  const getPixelDimensions = () => {
    if (unit === 'px') {
      return { w: Math.round(width), h: Math.round(height) };
    }
    const ratio = dpi;
    let factor = 1;
    if (unit === 'inch') factor = 1;
    else if (unit === 'cm') factor = 1 / 2.54;
    else if (unit === 'mm') factor = 1 / 25.4;

    return {
      w: Math.max(1, Math.round(width * factor * ratio)),
      h: Math.max(1, Math.round(height * factor * ratio))
    };
  };

  const { w: pxWidth, h: pxHeight } = getPixelDimensions();

  // Reset adjustments when photo changes
  const resetAdjustments = () => {
    setZoom(1.0);
    setRotate(0);
    setPanX(0);
    setPanY(0);
    setBrightness(0);
    setContrast(0);
    setSaturation(0);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const loadPhoto = (selectedFile: File) => {
    setErrorMsg(null);
    setFile(null);
    setImgElement(null);
    resetAdjustments();

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        setImgElement(img);
        setFile({
          id: `photo-${Date.now()}`,
          file: selectedFile,
          name: selectedFile.name,
          size: selectedFile.size,
          type: 'image',
          extension: selectedFile.name.split('.').pop()?.toLowerCase() || '',
          previewUrl: event.target?.result as string
        });
      };
      img.onerror = () => {
        setErrorMsg('Failed to decode the image file.');
      };
      img.src = event.target?.result as string;
    };
    reader.onerror = () => {
      setErrorMsg('Failed to read the image file.');
    };
    reader.readAsDataURL(selectedFile);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFile = e.dataTransfer.files[0];
      const ext = droppedFile.name.split('.').pop()?.toLowerCase() || '';
      if (!['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
        setErrorMsg('Please upload a valid image file (JPG, PNG, WEBP).');
        return;
      }
      loadPhoto(droppedFile);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      loadPhoto(e.target.files[0]);
    }
  };

  // Drag-to-pan handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!imgElement) return;
    setIsPanning(true);
    startDragRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX,
      panY
    };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isPanning || !imgElement) return;
    const dx = e.clientX - startDragRef.current.x;
    const dy = e.clientY - startDragRef.current.y;
    
    // Scale movement relative to zoom and dimension (higher zoom = slower panning)
    const containerWidth = 320; // Viewport size
    const containerHeight = 320;
    
    setPanX(startDragRef.current.panX + (dx / containerWidth));
    setPanY(startDragRef.current.panY + (dy / containerHeight));
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  // Touch support for drag-to-pan
  const handleTouchStart = (e: React.TouchEvent) => {
    if (!imgElement || e.touches.length === 0) return;
    setIsPanning(true);
    startDragRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
      panX,
      panY
    };
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isPanning || !imgElement || e.touches.length === 0) return;
    const dx = e.touches[0].clientX - startDragRef.current.x;
    const dy = e.touches[0].clientY - startDragRef.current.y;
    
    const containerWidth = 320;
    const containerHeight = 320;
    
    setPanX(startDragRef.current.panX + (dx / containerWidth));
    setPanY(startDragRef.current.panY + (dy / containerHeight));
  };

  // Live Canvas drawing for preview & export
  const drawImageToCanvas = (canvas: HTMLCanvasElement) => {
    if (!imgElement) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const targetW = pxWidth;
    const targetH = pxHeight;
    canvas.width = targetW;
    canvas.height = targetH;

    // Clear with white background
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, targetW, targetH);

    // Apply adjustments using HTML5 Canvas filter
    const bVal = 100 + brightness;
    const cVal = 100 + contrast;
    const sVal = 100 + saturation;
    ctx.filter = `brightness(${bVal}%) contrast(${cVal}%) saturate(${sVal}%)`;

    ctx.save();
    
    // Position context coordinate system in the center
    ctx.translate(targetW / 2, targetH / 2);
    
    // Rotate canvas context
    ctx.rotate((rotate * Math.PI) / 180);

    const imgW = imgElement.naturalWidth || imgElement.width;
    const imgH = imgElement.naturalHeight || imgElement.height;

    // Calculate Cover scale
    const ratioW = targetW / imgW;
    const ratioH = targetH / imgH;
    
    // Make sure we take the cover scale so it fully fits the box bounds
    const coverScale = Math.max(ratioW, ratioH);

    const drawW = imgW * coverScale * zoom;
    const drawH = imgH * coverScale * zoom;

    // Drag-to-pan offsets. We scale them by the viewport width/height
    const xOffset = panX * targetW;
    const yOffset = panY * targetH;

    // Draw centering image
    ctx.drawImage(imgElement, -drawW / 2 + xOffset, -drawH / 2 + yOffset, drawW, drawH);

    ctx.restore();
  };

  // Trigger drawing on preview changes
  useEffect(() => {
    if (imgElement && canvasRef.current) {
      drawImageToCanvas(canvasRef.current);
    }
  }, [imgElement, pxWidth, pxHeight, zoom, rotate, panX, panY, brightness, contrast, saturation]);

  // Execute processing & quality fitting
  const handleProcessExecution = async () => {
    if (!file || !imgElement) return;

    setIsProcessing(true);
    setProcessingStatus('Drafting image adjustments...');
    setErrorMsg(null);

    // Ensure state updates have populated
    await new Promise((resolve) => setTimeout(resolve, 50));

    try {
      const exportCanvas = document.createElement('canvas');
      drawImageToCanvas(exportCanvas);

      let finalBlob: Blob | null = null;
      let finalSizeKb = 0;
      let appliedQuality = 0.95;

      if (format === 'image/png') {
        setProcessingStatus('Packing lossless PNG format...');
        finalBlob = await new Promise((resolve) => {
          exportCanvas.toBlob((b) => resolve(b), 'image/png');
        });
        if (finalBlob) finalSizeKb = finalBlob.size / 1024;
      } else {
        // JPEG format with optional quality binary-search limit sizing
        if (limitSize && targetSizeKb > 0) {
          setProcessingStatus('Iteratively optimizing byte scale limits...');
          let minQ = 0.02;
          let maxQ = 1.0;
          let bestBlob: Blob | null = null;
          let bestSize = 0;

          // Binary search standard JPEG quality index
          for (let iter = 0; iter < 9; iter++) {
            const q = (minQ + maxQ) / 2;
            const b: Blob = await new Promise((resolve) => {
              exportCanvas.toBlob((blob) => resolve(blob!), 'image/jpeg', q);
            });
            const sizeKb = b.size / 1024;

            if (sizeKb <= targetSizeKb) {
              bestBlob = b;
              bestSize = sizeKb;
              appliedQuality = q;
              minQ = q; // try higher quality
            } else {
              maxQ = q; // limit reached, drop quality
              if (!bestBlob) {
                bestBlob = b;
                bestSize = sizeKb;
                appliedQuality = q;
              }
            }
          }
          finalBlob = bestBlob;
          finalSizeKb = bestSize;
        } else {
          setProcessingStatus('Formatting baseline JPEG...');
          finalBlob = await new Promise((resolve) => {
            exportCanvas.toBlob((b) => resolve(b), 'image/jpeg', 0.92);
          });
          if (finalBlob) finalSizeKb = finalBlob.size / 1024;
        }
      }

      if (!finalBlob) {
        throw new Error('Canvas conversion failed.');
      }

      // Download trigger
      const url = URL.createObjectURL(finalBlob);
      const a = document.createElement('a');
      const extStr = format === 'image/png' ? 'png' : 'jpg';
      const outName = `${file.name.split('.')[0]}_optimized.${extStr}`;

      a.href = url;
      a.download = outName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      onSuccess(outName, file.size, finalBlob.size, 'photo');
      setFile(null);
      setImgElement(null);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'An error occurred while compiling your image.');
    } finally {
      setIsProcessing(false);
      setProcessingStatus('');
    }
  };

  const removeStagedFile = () => {
    setFile(null);
    setImgElement(null);
    resetAdjustments();
  };

  return (
    <div className="space-y-6">
      
      {/* Tab Heading Info */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-xl font-display font-semibold text-slate-800 flex items-center gap-2">
            <Crop className="w-5 h-5 text-red-650" />
            Photo & Signature Form Optimizer
          </h2>
          <p className="text-xs text-slate-500 font-sans mt-0.5">
            Resize photos to government specifications, center/crop, clean shadows, and limit file sizes dynamically.
          </p>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {!file ? (
          
          /* Drop zone */
          <motion.div
            key="dropzone"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={`border-2 border-dashed rounded-3xl p-10 flex flex-col items-center justify-center transition-all min-h-[340px] cursor-pointer ${
              isDragging 
                ? 'border-red-500 bg-red-500/5 shadow-inner' 
                : 'border-slate-300 hover:border-red-500/50 hover:bg-slate-50/50'
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileSelect} 
              accept="image/jpeg,image/jpg,image/png,image/webp" 
              className="hidden" 
            />

            <div className="p-4 bg-red-50 text-red-600 rounded-2xl mb-4 shadow-sm">
              <UploadCloud className="w-8 h-8" />
            </div>

            <h3 className="font-semibold text-slate-700 font-sans text-base">
              Drag & drop photo or signature here
            </h3>
            <p className="text-xs text-slate-400 font-sans mt-1">
              Supports JPEG, PNG, WEBP (Max 20MB)
            </p>
            <button className="mt-5 py-2 px-4 bg-white border border-slate-300 text-slate-700 hover:border-slate-400 rounded-xl text-xs font-semibold shadow-sm transition-all">
              Browse Files
            </button>
          </motion.div>

        ) : (

          /* Photo Editing Canvas Workspace */
          <motion.div
            key="workspace"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start"
          >
            
            {/* Interactive Preview Canvas Box */}
            <div className="lg:col-span-7 flex flex-col items-center gap-4 bg-slate-50 p-6 rounded-3xl border border-slate-200 shadow-inner">
              <div className="w-full flex justify-between items-center px-1">
                <span className="text-[10px] uppercase font-mono tracking-wider font-bold text-slate-400">
                  Cropping Preview ({pxWidth} × {pxHeight} px)
                </span>
                <button 
                  onClick={removeStagedFile}
                  className="text-slate-400 hover:text-red-500 text-xs flex items-center gap-1 font-semibold hover:scale-105 transition-transform"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Remove
                </button>
              </div>

              {/* Crop Container Box */}
              <div 
                className="relative overflow-hidden border border-slate-300 bg-slate-900 rounded-2xl shadow-md select-none touch-none flex items-center justify-center cursor-move"
                style={{
                  width: '320px',
                  height: '320px',
                }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleMouseUp}
              >
                
                {/* Canvas Drawing Layer */}
                <canvas 
                  ref={canvasRef}
                  className="max-w-full max-h-full object-contain pointer-events-none"
                  style={{
                    aspectRatio: `${pxWidth} / ${pxHeight}`
                  }}
                />

                {/* Framing Overlay Grid */}
                <div className="absolute inset-0 pointer-events-none border-2 border-red-500/60 flex flex-col justify-between">
                  <div className="border-b border-red-500/25 h-1/3 w-full" />
                  <div className="border-b border-red-500/25 h-1/3 w-full" />
                </div>
                <div className="absolute inset-0 pointer-events-none flex justify-between">
                  <div className="border-r border-red-500/25 w-1/3 h-full" />
                  <div className="border-r border-red-500/25 w-1/3 h-full" />
                </div>

                {/* Tiny guide label */}
                <div className="absolute bottom-2 left-2 bg-slate-950/70 backdrop-blur-md border border-slate-800 text-[10px] text-white py-0.5 px-2 rounded-md font-mono select-none pointer-events-none">
                  Drag image to crop/pan
                </div>
              </div>

              {/* Adjustments Tool Strip */}
              <div className="w-full grid grid-cols-4 gap-1.5 pt-2">
                <button
                  onClick={() => setZoom(prev => Math.max(0.5, prev - 0.1))}
                  className="py-2 px-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-colors flex items-center justify-center gap-1.5 text-xs text-slate-700 font-semibold"
                  title="Zoom Out"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                  <span>Zoom -</span>
                </button>
                
                <button
                  onClick={() => setZoom(prev => Math.min(5.0, prev + 0.1))}
                  className="py-2 px-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-colors flex items-center justify-center gap-1.5 text-xs text-slate-700 font-semibold"
                  title="Zoom In"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                  <span>Zoom +</span>
                </button>

                <button
                  onClick={() => setRotate(prev => (prev + 90) % 360)}
                  className="py-2 px-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-colors flex items-center justify-center gap-1.5 text-xs text-slate-700 font-semibold"
                  title="Rotate Right"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  <span>Rotate</span>
                </button>

                <button
                  onClick={resetAdjustments}
                  className="py-2 px-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-colors flex items-center justify-center gap-1.5 text-xs text-slate-700 font-semibold"
                >
                  <span>Reset</span>
                </button>
              </div>

              {/* Details banner */}
              <div className="w-full bg-slate-100/70 border border-slate-200/50 p-3 rounded-2xl flex items-start gap-2 text-[11px] text-slate-500 leading-relaxed font-sans">
                <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                <div>
                  <strong>Tip for clean uploads:</strong> Select presets first, adjust zoom/crop using mouse dragging directly on the photo, then modify the brightness filter to ensure shadows on the background are washed out.
                </div>
              </div>
            </div>

            {/* Sidebar Sizing Controls */}
            <div className="lg:col-span-5 space-y-6">
              
              {/* Presets Grid */}
              <div className="bg-white border border-slate-250 rounded-3xl p-5 space-y-3.5 shadow-sm animate-fade-in">
                <h4 className="text-xs font-bold font-mono text-slate-400 uppercase tracking-wider">
                  1. Choose Presets
                </h4>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-2 max-h-[190px] overflow-y-auto pr-1">
                  {PRESETS.map((p) => {
                    const isSelected = selectedPreset === p.name;
                    return (
                      <button
                        key={p.name}
                        onClick={() => applyPreset(p.name)}
                        className={`text-left p-2.5 rounded-xl border transition-all text-xs flex justify-between items-center cursor-pointer ${
                          isSelected 
                            ? 'bg-red-50 border-red-200 shadow-sm text-red-755 font-semibold' 
                            : 'border-slate-200 hover:border-slate-350 hover:bg-slate-50 text-slate-650'
                        }`}
                      >
                        <div>
                          <p className="font-semibold">{p.name}</p>
                          <p className="text-[10px] text-slate-400 font-normal">{p.description}</p>
                        </div>
                        {isSelected && <Check className="w-4 h-4 text-red-500 shrink-0" />}
                      </button>
                    );
                  })}
                  
                  <button
                    onClick={() => setSelectedPreset('custom')}
                    className={`text-left p-2.5 rounded-xl border transition-all text-xs flex justify-between items-center cursor-pointer ${
                      selectedPreset === 'custom' 
                        ? 'bg-red-50 border-red-200 shadow-sm text-red-755 font-semibold' 
                        : 'border-slate-200 hover:border-slate-350 hover:bg-slate-50 text-slate-650'
                    }`}
                  >
                    <div>
                      <p className="font-semibold">Custom Dimensions</p>
                      <p className="text-[10px] text-slate-400 font-normal">Manually set size & target limit</p>
                    </div>
                    {selectedPreset === 'custom' && <Check className="w-4 h-4 text-red-500 shrink-0" />}
                  </button>
                </div>
              </div>

              {/* Dimensions form */}
              <div className="bg-white border border-slate-250 rounded-3xl p-5 space-y-4 shadow-sm">
                <h4 className="text-xs font-bold font-mono text-slate-400 uppercase tracking-wider">
                  2. Sizing Parameters
                </h4>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase font-mono mb-1">Unit</label>
                    <select
                      value={unit}
                      onChange={(e) => handleCustomDimensionChange(width, height, e.target.value as any)}
                      className="w-full text-xs font-semibold p-2 border border-slate-300 rounded-xl focus:ring-1 focus:ring-red-500"
                    >
                      <option value="px">Pixels (px)</option>
                      <option value="cm">Centimeters (cm)</option>
                      <option value="mm">Millimeters (mm)</option>
                      <option value="inch">Inches (in)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase font-mono mb-1">Width</label>
                    <input
                      type="number"
                      value={width}
                      step={unit === 'px' ? 1 : 0.1}
                      onChange={(e) => handleCustomDimensionChange(parseFloat(e.target.value) || 0, height, unit)}
                      className="w-full text-xs font-semibold p-2 border border-slate-300 rounded-xl focus:ring-1 focus:ring-red-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase font-mono mb-1">Height</label>
                    <input
                      type="number"
                      value={height}
                      step={unit === 'px' ? 1 : 0.1}
                      onChange={(e) => handleCustomDimensionChange(width, parseFloat(e.target.value) || 0, unit)}
                      className="w-full text-xs font-semibold p-2 border border-slate-300 rounded-xl focus:ring-1 focus:ring-red-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase font-mono mb-1">Target DPI</label>
                    <select
                      value={dpi}
                      onChange={(e) => setDpi(parseInt(e.target.value) || 300)}
                      disabled={unit === 'px'}
                      className="w-full text-xs font-semibold p-2 border border-slate-300 rounded-xl focus:ring-1 focus:ring-red-500 disabled:bg-slate-105 disabled:text-slate-400"
                    >
                      <option value="150">150 DPI</option>
                      <option value="200">200 DPI (Govt Scan)</option>
                      <option value="300">300 DPI (High Res)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase font-mono mb-1">Output Format</label>
                    <select
                      value={format}
                      onChange={(e) => setFormat(e.target.value as any)}
                      className="w-full text-xs font-semibold p-2 border border-slate-300 rounded-xl focus:ring-1 focus:ring-red-500"
                    >
                      <option value="image/jpeg">JPEG (.jpg)</option>
                      <option value="image/png">PNG (.png)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Compression File Size Squeeze */}
              <div className="bg-white border border-slate-250 rounded-3xl p-5 space-y-4 shadow-sm">
                <div className="flex justify-between items-center">
                  <h4 className="text-xs font-bold font-mono text-slate-400 uppercase tracking-wider">
                    3. Target File Size Limit
                  </h4>
                  
                  <label className="relative inline-flex items-center cursor-pointer select-none">
                    <input 
                      type="checkbox" 
                      checked={limitSize} 
                      onChange={(e) => setLimitSize(e.target.checked)} 
                      disabled={format === 'image/png'}
                      className="sr-only peer" 
                    />
                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-red-600 peer-disabled:bg-slate-100 peer-disabled:opacity-50"></div>
                  </label>
                </div>

                {limitSize && format === 'image/jpeg' ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500 font-sans">Max allowed size limit:</span>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          value={targetSizeKb}
                          onChange={(e) => setTargetSizeKb(Math.max(1, parseInt(e.target.value) || 0))}
                          className="w-16 text-center text-xs font-bold p-1 border border-slate-300 rounded-lg focus:ring-1 focus:ring-red-500"
                        />
                        <span className="text-xs font-bold font-mono text-slate-500">KB</span>
                      </div>
                    </div>
                    
                    <input
                      type="range"
                      min="10"
                      max="1000"
                      step="10"
                      value={targetSizeKb}
                      onChange={(e) => setTargetSizeKb(parseInt(e.target.value))}
                      className="w-full accent-red-600 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                    />
                    <div className="flex justify-between text-[9px] font-mono text-slate-400">
                      <span>10 KB</span>
                      <span>500 KB</span>
                      <span>1000 KB (1 MB)</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-400 leading-normal font-sans">
                    {format === 'image/png' 
                      ? 'Lossless PNG formats do not support size limit optimization. Result size depends entirely on image complexity.'
                      : 'File size limits are disabled. Images will export at maximum native resolution quality (92%).'}
                  </p>
                )}
              </div>

              {/* Adjustments Filters Panel */}
              <div className="bg-white border border-slate-250 rounded-3xl p-5 space-y-4 shadow-sm">
                <h4 className="text-xs font-bold font-mono text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Sliders className="w-4 h-4 text-slate-400" />
                  4. Image Filters & Balancing
                </h4>

                <div className="space-y-3">
                  
                  {/* Brightness */}
                  <div>
                    <div className="flex justify-between text-xs text-slate-500 mb-1 font-sans">
                      <span>Brightness</span>
                      <span className="font-mono text-slate-400">{brightness > 0 ? `+${brightness}` : brightness}%</span>
                    </div>
                    <input
                      type="range"
                      min="-100"
                      max="100"
                      value={brightness}
                      onChange={(e) => setBrightness(parseInt(e.target.value))}
                      className="w-full accent-red-600 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>

                  {/* Contrast */}
                  <div>
                    <div className="flex justify-between text-xs text-slate-500 mb-1 font-sans">
                      <span>Contrast</span>
                      <span className="font-mono text-slate-400">{contrast > 0 ? `+${contrast}` : contrast}%</span>
                    </div>
                    <input
                      type="range"
                      min="-100"
                      max="100"
                      value={contrast}
                      onChange={(e) => setContrast(parseInt(e.target.value))}
                      className="w-full accent-red-600 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>

                  {/* Saturation */}
                  <div>
                    <div className="flex justify-between text-xs text-slate-500 mb-1 font-sans">
                      <span>Saturation</span>
                      <span className="font-mono text-slate-400">{saturation > 0 ? `+${saturation}` : saturation}%</span>
                    </div>
                    <input
                      type="range"
                      min="-100"
                      max="100"
                      value={saturation}
                      onChange={(e) => setSaturation(parseInt(e.target.value))}
                      className="w-full accent-red-600 h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>
                  
                </div>
              </div>

              {/* Processing Alerts */}
              {errorMsg && (
                <div className="p-3 bg-red-50 border border-red-100 rounded-2xl flex items-start gap-2.5 text-xs text-red-600">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Execute Process & Download Button */}
              <button
                onClick={handleProcessExecution}
                disabled={isProcessing}
                className="w-full py-4 px-6 bg-red-650 hover:bg-red-750 active:bg-red-800 disabled:bg-slate-300 disabled:cursor-not-allowed transition-all text-white font-sans text-sm font-semibold rounded-2xl shadow-md flex items-center justify-center gap-2 cursor-pointer"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{processingStatus || 'Compiling changes...'}</span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    <span>Process & Download Image</span>
                  </>
                )}
              </button>

            </div>

          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
