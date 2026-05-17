import axios from 'axios';
import zlib from 'zlib';

const pdf = require('pdf-parse');
const mammoth = require('mammoth');

/**
 * Compress base64 string using zlib (GZIP)
 * Handles data URL prefix if present
 */
export function compressBase64(base64String: string): string {
  if (!base64String || base64String.trim() === "") return base64String;
  
  try {
    const hasPrefix = base64String.includes(",");
    const base64Data = hasPrefix ? base64String.split(",")[1] : base64String;
    const prefix = hasPrefix ? base64String.split(",")[0] + "," : "";

    const buffer = Buffer.from(base64Data, "base64");
    const originalSize = buffer.length;

    console.log(`[COMPRESSION] Original Base64 size: ${(originalSize / 1024).toFixed(2)} KB`);

    const compressed = zlib.gzipSync(buffer);
    const compressedSize = compressed.length;
    const reduction = ((1 - (compressedSize / originalSize)) * 100).toFixed(2);

    console.log(`[COMPRESSION] Compressed size: ${(compressedSize / 1024).toFixed(2)} KB (Reduced by ${reduction}%)`);

    return prefix + compressed.toString("base64");
  } catch (error) {
    console.error("[COMPRESSION] Compression failed:", error);
    return base64String;
  }
}

/**
 * Decompress base64 string using zlib (GZIP)
 * Handles both compressed and uncompressed strings
 */
export function decompressBase64(base64String: string): string {
  if (!base64String || base64String.trim() === "") return base64String;

  try {
    const hasPrefix = base64String.includes(",");
    const base64Data = hasPrefix ? base64String.split(",")[1] : base64String;
    const prefix = hasPrefix ? base64String.split(",")[0] + "," : "";

    const buffer = Buffer.from(base64Data, "base64");
    
    // Check for GZIP magic numbers (0x1f 0x8b)
    if (buffer.length > 2 && buffer[0] === 0x1f && buffer[1] === 0x8b) {
      console.log(`[DECOMPRESSION] Compressed data detected. Decompressing...`);
      const decompressed = zlib.gunzipSync(buffer);
      console.log(`[DECOMPRESSION] Decompression successful. Original size restored: ${(decompressed.length / 1024).toFixed(2)} KB`);
      return prefix + decompressed.toString("base64");
    }
    
    return base64String;
  } catch (error) {
    console.warn("[DECOMPRESSION] Decompression failed, assuming non-compressed data:", error);
    return base64String;
  }
}

/**
 * Extract text content from various document types
 */
export async function extractTextFromDocument(fileUrl: string, fileName: string): Promise<string> {
  const fileExtension = getFileExtension(fileName);
  
  switch (fileExtension) {
    case 'pdf':
      return await extractTextFromPDF(fileUrl);
    case 'docx':
    case 'doc':
      return await extractTextFromDOCX(fileUrl);
    case 'txt':
    case 'text':
      return await extractTextFromTXT(fileUrl);
    default:
      throw new Error(`Unsupported file type: ${fileExtension}`);
  }
}

/**
 * Extract text content from PDF file URL
 */
export async function extractTextFromPDF(fileUrl: string): Promise<string> {
  try {
    console.log('Downloading PDF file from S3...');
    const response = await axios.get(fileUrl, {
      responseType: 'arraybuffer',
      timeout: 30000, // 30 seconds timeout
    });
    
    console.log('Extracting text from PDF buffer...');
    const buffer = Buffer.from(response.data);
    
    // Extract text from PDF buffer
    const data = await pdf(buffer);
    
    if (!data.text || data.text.trim().length === 0) {
      throw new Error('No text content found in the PDF');
    }
    
    console.log('Successfully extracted text from PDF');
    return data.text;
  } catch (error) {
    console.error('Error extracting text from PDF:', error);
    throw new Error(`Failed to extract text from PDF: ${error.message}`);
  }
}

/**
 * Extract text content from DOCX file URL
 */
export async function extractTextFromDOCX(fileUrl: string): Promise<string> {
  try {
    console.log('Downloading DOCX file from S3...');
    const response = await axios.get(fileUrl, {
      responseType: 'arraybuffer',
      timeout: 30000, // 30 seconds timeout
    });
    
    console.log('Extracting text from DOCX buffer...');
    const buffer = Buffer.from(response.data);
    
    // Extract text from DOCX buffer using mammoth
    const result = await mammoth.extractRawText({ buffer });
    
    if (!result.value || result.value.trim().length === 0) {
      throw new Error('No text content found in the DOCX file');
    }
    
    console.log('Successfully extracted text from DOCX');
    return result.value;
  } catch (error) {
    console.error('Error extracting text from DOCX:', error);
    throw new Error(`Failed to extract text from DOCX: ${error.message}`);
  }
}

/**
 * Extract text content from TXT file URL
 */
export async function extractTextFromTXT(fileUrl: string): Promise<string> {
  try {
    console.log('Downloading TXT file from S3...');
    const response = await axios.get(fileUrl, {
      responseType: 'text',
      timeout: 30000, // 30 seconds timeout
    });
    
    console.log('Processing text content...');
    const textContent = response.data;
    
    if (!textContent || textContent.trim().length === 0) {
      throw new Error('No text content found in the TXT file');
    }
    
    console.log('Successfully extracted text from TXT file');
    return textContent;
  } catch (error) {
    console.error('Error extracting text from TXT:', error);
    throw new Error(`Failed to extract text from TXT: ${error.message}`);
  }
}

/**
 * Get file extension from filename
 */
export function getFileExtension(fileName: string): string {
  return fileName.split('.').pop()?.toLowerCase() || '';
}

/**
 * Check if file is a supported document type
 */
export function isSupportedDocument(fileName: string): boolean {
  const extension = getFileExtension(fileName);
  const supportedExtensions = ['pdf', 'docx', 'doc', 'txt', 'text'];
  return supportedExtensions.includes(extension);
}

/**
 * Get document type from filename
 */
export function getDocumentType(fileName: string): string {
  const extension = getFileExtension(fileName);
  
  switch (extension) {
    case 'pdf':
      return 'PDF Document';
    case 'docx':
    case 'doc':
      return 'Word Document';
    case 'txt':
    case 'text':
      return 'Text File';
    default:
      return 'Unknown Document';
  }
}

/**
 * Validate file size (optional utility)
 */
export function validateFileSize(buffer: Buffer, maxSizeMB: number = 10): boolean {
  const fileSizeInMB = buffer.length / (1024 * 1024);
  return fileSizeInMB <= maxSizeMB;
}

/**
 * Clean and prepare text for AI processing
 */
export function cleanTextForAI(text: string): string {
  // Remove excessive whitespace and normalize line breaks
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}
