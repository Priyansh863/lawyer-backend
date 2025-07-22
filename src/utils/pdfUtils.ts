import axios from 'axios';
const pdf = require('pdf-parse');

/**
 * Extract text content from PDF file URL
 */
export async function extractTextFromPDF(fileUrl: string): Promise<string> {
  try {
    console.log('Downloading PDF file from S3...');
    // Download PDF file from S3
    const response = await axios.get(fileUrl, {
      responseType: 'arraybuffer',
      timeout: 30000, // 30 seconds timeout
    });
    
    console.log('Extracting text from PDF buffer...');
    const buffer = Buffer.from(response.data);

    console.log('Extracted text from PDF buffer',buffer);
    
    // Extract text from PDF buffer
    const data = await pdf(buffer);
    
    if (!data.text || data.text.trim().length === 0) {
      throw new Error('No text content found in the PDF');
    }
    
    console.log('Extracted text from PDF');
    return data.text;
  } catch (error) {
    console.error('Error extracting text from PDF:', error);
    throw new Error(`Failed to extract text from PDF: ${error.message}`);
  }
}

/**
 * Validate if file is a PDF based on filename
 */
export function isPDFFile(fileName: string): boolean {
  const fileExtension = fileName.split('.').pop()?.toLowerCase();
  return fileExtension === 'pdf';
}

/**
 * Validate file size (optional utility)
 */
export function validateFileSize(buffer: Buffer, maxSizeMB: number = 10): boolean {
  const fileSizeInMB = buffer.length / (1024 * 1024);
  return fileSizeInMB <= maxSizeMB;
}
