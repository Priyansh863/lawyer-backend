import axios from 'axios';
const pdf = require('pdf-parse');
const mammoth = require('mammoth');

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
