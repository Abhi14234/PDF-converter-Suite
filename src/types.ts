export type ToolType = 'merge' | 'split' | 'compress' | 'photo';

export interface UploadedFile {
  id: string;
  file: File;
  name: string;
  size: number;
  type: 'pdf' | 'docx' | 'image' | 'unsupported';
  extension: string;
  previewUrl?: string; // For images/thumbnails
  pageCount?: number;  // For PDFs
  pages?: string[];    // Array of base64 images of pages for splitting/previews
  isProcessing?: boolean;
}

export interface SplitRange {
  start: number;
  end: number;
}

export interface CompressionSettings {
  quality: number; // 1 to 100
  dpiScale: number; // 0.1 to 2.0 (e.g., 0.5, 1.0, 1.5)
  targetSizeKb?: number; // Optional target size (e.g., 500 for limit of 500KB)
  resizeMode: 'smart' | 'manual';
}

export interface HistoryOperation {
  id: string;
  timestamp: Date;
  tool: ToolType;
  inputFiles: string[];
  outputName: string;
  outputSize: number;
  savedSize?: number; // bytes saved
}
