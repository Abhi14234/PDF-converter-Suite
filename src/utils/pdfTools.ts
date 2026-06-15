import { PDFDocument } from 'pdf-lib';
import { jsPDF } from 'jspdf';
import mammoth from 'mammoth';

// Declare pdfjsLib globally since it is loaded from HTML scripts CDN
declare const pdfjsLib: any;

/**
 * Loads any image file (PNG, JPG, WebP) and converts it to standard baseline JPG bytes
 * using an HTML canvas. This guarantees there are no "unsupported progressive JPEG"
 * or "unsupported PNG format" errors in pdf-lib.
 */
export async function processImageToJpgBytes(file: File): Promise<{ bytes: Uint8Array, width: number, height: number }> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width;
        canvas.height = img.naturalHeight || img.height;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to capture canvas 2D context'));
          return;
        }
        
        // Draw image onto canvas
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height); // white background
        ctx.drawImage(img, 0, 0);
        
        // Convert to JPG data url
        const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
        const base64Data = dataUrl.split(',')[1];
        
        // Decode base64 to byte array
        const binaryString = window.atob(base64Data);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        
        URL.revokeObjectURL(objectUrl);
        resolve({
          bytes,
          width: canvas.width,
          height: canvas.height
        });
      } catch (err) {
        URL.revokeObjectURL(objectUrl);
        reject(err);
      }
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to load image file into browser canvas'));
    };
    
    img.src = objectUrl;
  });
}

/**
 * Converts generic picture file (PNG, JPG, WebP) to custom A4-fitted PDF bytes
 */
export async function convertImageToPdfBytes(file: File): Promise<Uint8Array> {
  const { bytes, width, height } = await processImageToJpgBytes(file);
  
  const pdfDoc = await PDFDocument.create();
  // Standard A4 dimensions in Page Points (595.27 x 841.89 points)
  const a4Width = 595.27;
  const a4Height = 841.89;
  
  const page = pdfDoc.addPage([a4Width, a4Height]);
  const pdfImage = await pdfDoc.embedJpg(bytes);
  
  // Fit image inside A4 margins preserving aspect ratio
  const margin = 36; // 0.5 inch margin (36 points)
  const maxWidth = a4Width - (margin * 2);
  const maxHeight = a4Height - (margin * 2);
  
  let drawWidth = width;
  let drawHeight = height;
  
  const widthRatio = maxWidth / width;
  const heightRatio = maxHeight / height;
  const scale = Math.min(widthRatio, heightRatio, 1.0); // Don't upscale past original resolution
  
  drawWidth = width * scale;
  drawHeight = height * scale;
  
  const x = margin + (maxWidth - drawWidth) / 2;
  const y = margin + (maxHeight - drawHeight) / 2;
  
  page.drawImage(pdfImage, {
    x,
    y,
    width: drawWidth,
    height: drawHeight,
  });
  
  return await pdfDoc.save();
}

/**
 * Converts Word document (.docx) to professional flowing A4 PDF bytes
 */
export async function convertDocxToPdfBytes(file: File): Promise<Uint8Array> {
  const arrayBuffer = await file.arrayBuffer();
  // Extract text using Mammoth to avoid heavy bloated libraries
  const { value: rawText } = await mammoth.extractRawText({ arrayBuffer });
  
  if (!rawText || rawText.trim() === '') {
    throw new Error('Document seems to be empty or contains no extractable text content');
  }

  // Generate layout with jsPDF mapping paragraphs to beautiful flowing typography
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });
  
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  
  const margin = 20; // 20mm margin
  const contentWidth = pageWidth - (margin * 2);
  const startY = 30; // Leave space for styled header
  
  // Configure beautiful, standard formal layout fonts
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(11);
  
  // Split raw text into paragraphs
  const paragraphs = rawText.split('\n');
  let currentY = startY;
  let pageIndex = 1;
  
  const drawPageDecorations = (pIndex: number) => {
    // Header Line and document title rule
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.setLineWidth(0.3);
    doc.line(margin, 15, pageWidth - margin, 15);
    
    // Header info
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184); // slate-400
    doc.text(file.name.substring(0, 40) + (file.name.length > 40 ? '...' : ''), margin, 12);
    doc.text('CONVERTED DOCUMENT', pageWidth - margin, 12, { align: 'right' });
    
    // Footer line
    doc.line(margin, pageHeight - 15, pageWidth - margin, pageHeight - 15);
    doc.text(`Page ${pIndex}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
    
    // Restore default styles for text writing flow
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(51, 65, 85); // slate-700
  };
  
  // Draw header/footer for the first page
  drawPageDecorations(pageIndex);
  
  for (const para of paragraphs) {
    const text = para.trim();
    if (!text) {
      currentY += 4; // empty line spacing
      continue;
    }
    
    // Set appropriate styling (title vs paragraph)
    const isTitle = text.length < 100 && (text.toUpperCase() === text && text.length > 3 || text.startsWith('CHAPTER') || text.startsWith('SECTION'));
    if (isTitle) {
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(30, 41, 59); // slate-800
      currentY += 4;
    } else {
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(11);
      doc.setTextColor(51, 65, 85); // slate-700
    }
    
    // Auto-wrap paragraphs
    const lines = doc.splitTextToSize(text, contentWidth);
    const lineHeight = isTitle ? 6 : 5.5;
    
    for (const line of lines) {
      if (currentY + lineHeight > pageHeight - 20) {
        // Add new page
        doc.addPage();
        pageIndex++;
        drawPageDecorations(pageIndex);
        currentY = startY;
      }
      
      doc.text(line, margin, currentY);
      currentY += lineHeight;
    }
    
    currentY += 5; // spacing between paragraphs
  }
  
  const arrayBufferOut = doc.output('arraybuffer');
  return new Uint8Array(arrayBufferOut);
}

/**
 * Returns the page count of any PDF file bytes
 */
export async function getPdfPageCount(pdfBytes: Uint8Array): Promise<number> {
  const pdfDoc = await PDFDocument.load(pdfBytes);
  return pdfDoc.getPageCount();
}

/**
 * Merges a list of PDF byte arrays into a single PDF
 */
export async function mergePdfs(pdfBuffers: Uint8Array[]): Promise<Uint8Array> {
  if (pdfBuffers.length === 0) {
    throw new Error('No PDF files selected to merge');
  }
  if (pdfBuffers.length === 1) {
    return pdfBuffers[0];
  }
  
  const mergedPdf = await PDFDocument.create();
  
  for (const buffer of pdfBuffers) {
    const srcPdf = await PDFDocument.load(buffer);
    const indices = Array.from({ length: srcPdf.getPageCount() }, (_, i) => i);
    const copiedPages = await mergedPdf.copyPages(srcPdf, indices);
    copiedPages.forEach((page) => mergedPdf.addPage(page));
  }
  
  return await mergedPdf.save();
}

/**
 * Splits a PDF file into multiple arrays corresponding to page sets
 */
export async function splitPdf(pdfBytes: Uint8Array, ranges: { start: number; end: number }[]): Promise<{ name: string; bytes: Uint8Array }[]> {
  const srcPdf = await PDFDocument.load(pdfBytes);
  const totalPages = srcPdf.getPageCount();
  const splitted: { name: string; bytes: Uint8Array }[] = [];
  
  for (let i = 0; i < ranges.length; i++) {
    const range = ranges[i];
    
    // Bounds check
    const start = Math.max(1, Math.min(range.start, totalPages));
    const end = Math.max(start, Math.min(range.end, totalPages));
    
    const subPdf = await PDFDocument.create();
    
    // Gather 0-based page indices
    const pageIndices: number[] = [];
    for (let pIdx = start - 1; pIdx <= end - 1; pIdx++) {
      pageIndices.push(pIdx);
    }
    
    const copiedPages = await subPdf.copyPages(srcPdf, pageIndices);
    copiedPages.forEach((p) => subPdf.addPage(p));
    
    const bytes = await subPdf.save();
    splitted.push({
      name: `pages-${start}-to-${end}.pdf`,
      bytes
    });
  }
  
  return splitted;
}

/**
 * Compresses/resizes an existing PDF document to target sizes (reduces quality, dpi scale).
 * Under the hood, this converts the PDF into individual image-canvases at lowered resolutions (DPI),
 * applies JPEG compression, and converts back into a high-compatible PDF.
 * This is incredibly sturdy and guarantees significant reduction of size for form submissions.
 */
export async function compressAndResizePdf(
  pdfBytes: Uint8Array, 
  quality: number, // 0.1 to 1.0
  dpiScale: number, // 0.3 to 2.0
  onProgress?: (progress: number) => void
): Promise<Uint8Array> {
  if (typeof window === 'undefined' || !(window as any).pdfjsLib) {
    throw new Error('PDF.js library is not loaded. Try reloading the webapp.');
  }

  // Load PDF into PDF.js reader
  const pdfJsDoc = await (window as any).pdfjsLib.getDocument({ data: pdfBytes }).promise;
  const numPages = pdfJsDoc.numPages;
  
  const compressedPdfDoc = await PDFDocument.create();
  
  for (let i = 1; i <= numPages; i++) {
    const page = await pdfJsDoc.getPage(i);
    
    // Use scale parameter directly to reduce resolution (DPI scaling)
    const viewport = page.getViewport({ scale: dpiScale });
    
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    
    const canvasContext = canvas.getContext('2d');
    if (!canvasContext) {
      throw new Error(`Failed to configure canvas viewport context for page ${i}`);
    }
    
    // Render PDF page to memory canvas
    canvasContext.fillStyle = '#FFFFFF';
    canvasContext.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext, viewport }).promise;
    
    // Export page canvas as compressed JPG image
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    const base64Data = dataUrl.split(',')[1];
    
    const binaryData = window.atob(base64Data);
    const imageBytes = new Uint8Array(binaryData.length);
    for (let b = 0; b < binaryData.length; b++) {
      imageBytes[b] = binaryData.charCodeAt(b);
    }
    
    // Embed JPG image back into pdf-lib document
    const embeddedImage = await compressedPdfDoc.embedJpg(imageBytes);
    
    // Maintain standard sizing bounds matching original page aspect ratio
    const widthInPoints = (viewport.width / dpiScale) * 0.75; // standard conversion scaled
    const heightInPoints = (viewport.height / dpiScale) * 0.75;
    
    const newPage = compressedPdfDoc.addPage([viewport.width / dpiScale, viewport.height / dpiScale]);
    newPage.drawImage(embeddedImage, {
      x: 0,
      y: 0,
      width: viewport.width / dpiScale,
      height: viewport.height / dpiScale,
    });
    
    if (onProgress) {
      onProgress(Math.round((i / numPages) * 100));
    }
  }
  
  return await compressedPdfDoc.save();
}

/**
 * Renders thumbnail image of the first page of a PDF file using PDF.js
 */
export async function generatePdfPageThumbnail(pdfBytes: Uint8Array, pageNum: number = 1, scale: number = 0.5): Promise<string> {
  if (typeof window === 'undefined' || !(window as any).pdfjsLib) {
    throw new Error('PDF.js library is not loaded');
  }

  const pdfJsDoc = await (window as any).pdfjsLib.getDocument({ data: pdfBytes }).promise;
  if (pageNum > pdfJsDoc.numPages) {
    throw new Error('Requested page exceeds bounds of doc');
  }
  
  const page = await pdfJsDoc.getPage(pageNum);
  const viewport = page.getViewport({ scale });
  
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to create canvas context');
  }
  
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas.toDataURL('image/jpeg', 0.8);
}

/**
 * Returns basic visual page listings (as base64 thumbnails) for all pages in a PDF
 */
export async function getPdfPagesThumbnails(pdfBytes: Uint8Array, onProgress?: (p: number) => void): Promise<string[]> {
  if (typeof window === 'undefined' || !(window as any).pdfjsLib) {
    throw new Error('PDF.js library is not loaded');
  }
  
  const pdfJsDoc = await (window as any).pdfjsLib.getDocument({ data: pdfBytes }).promise;
  const numPages = pdfJsDoc.numPages;
  const thumbnails: string[] = [];
  
  for (let i = 1; i <= numPages; i++) {
    const thumbUrl = await generatePdfPageThumbnail(pdfBytes, i, 0.35);
    thumbnails.push(thumbUrl);
    if (onProgress) {
      onProgress(Math.round((i / numPages) * 100));
    }
  }
  
  return thumbnails;
}

/**
 * Smart automatic compression optimization system. Returns bytes that are scaled to adhere to user target KB guidelines.
 * Tries progressively lower parameters in binary search loops to ensure file size parameters are respected.
 */
export async function autoCompressWithKbLimit(
  pdfBytes: Uint8Array,
  targetSizeKb: number,
  onProgress?: (msg: string) => void
): Promise<{ bytes: Uint8Array, quality: number, scale: number, finalSizeKb: number }> {
  let optimalBytes = pdfBytes;
  let currentSizeKb = pdfBytes.length / 1024;
  
  if (currentSizeKb <= targetSizeKb) {
    if (onProgress) onProgress(`PDF is already ${Math.round(currentSizeKb)}KB which satisfies your ${targetSizeKb}KB guideline. No compression needed!`);
    return { bytes: pdfBytes, quality: 1.0, scale: 1.0, finalSizeKb: currentSizeKb };
  }
  
  // Set of test steps [quality, scale]
  const compressSteps = [
    { quality: 0.85, scale: 1.0  }, // High
    { quality: 0.75, scale: 0.85 }, // Medium-High
    { quality: 0.65, scale: 0.7  }, // Medium
    { quality: 0.55, scale: 0.6  }, // Low-Medium
    { quality: 0.45, scale: 0.5  }, // Low
    { quality: 0.35, scale: 0.4  }, // Minimal Space
    { quality: 0.25, scale: 0.3  }  // Ultimate Compression
  ];

  if (onProgress) onProgress(`File size (${Math.round(currentSizeKb)}KB) exceeds target (${targetSizeKb}KB). Optimizing parameters...`);
  
  for (let s = 0; s < compressSteps.length; s++) {
    const step = compressSteps[s];
    if (onProgress) onProgress(`Attempting Pass ${s + 1}/${compressSteps.length} (Quality: ${Math.round(step.quality*100)}%, Resolution Scale: ${Math.round(step.scale*100)}%)`);
    
    try {
      const bytes = await compressAndResizePdf(pdfBytes, step.quality, step.scale);
      const sizeKb = bytes.length / 1024;
      
      if (onProgress) onProgress(`Pass ${s + 1} resulted in size: ${Math.round(sizeKb)}KB`);
      
      optimalBytes = bytes;
      currentSizeKb = sizeKb;
      
      // If we got under target or are at the last fallback step
      if (sizeKb <= targetSizeKb) {
        if (onProgress) onProgress(`Successfully adjusted file size to ${Math.round(sizeKb)}KB.`);
        return { bytes: optimalBytes, quality: step.quality, scale: step.scale, finalSizeKb: currentSizeKb };
      }
    } catch (err) {
      console.error(`Compression step failed:`, err);
    }
  }
  
  if (onProgress) onProgress(`Reached maximal compression. Best size accomplished: ${Math.round(currentSizeKb)}KB`);
  const lastStep = compressSteps[compressSteps.length - 1];
  return { bytes: optimalBytes, quality: lastStep.quality, scale: lastStep.scale, finalSizeKb: currentSizeKb };
}
