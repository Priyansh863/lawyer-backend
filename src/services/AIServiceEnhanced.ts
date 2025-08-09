import UserDocument from '../models/user_documents';
import { extractTextFromPDF, isPDFFile } from '../utils/pdfUtils';
import openaiUtils from '../utils/openaiUtils';
import openaiUtilsEnhanced from '../utils/openaiUtilsEnhanced';
import axios from 'axios';
import fs from 'fs';
import path from 'path';

class AIServiceEnhanced {

  /**
   * Process document: extract content and generate summary (PDF, Image, Video)
   */
  async processDocument(documentId: string): Promise<{ success: boolean; message: string; summary?: string }> {
    try {
      // Find the document
      const document = await UserDocument.findById(documentId);
      if (!document) {
        return { success: false, message: 'Document not found' };
      }

      const fileUrl = document.link;
      const fileName = document.document_name;
      const fileType = this.getFileType(fileName);

      console.log(`Processing ${fileType} file: ${fileName}`);

      let extractedContent = '';
      let summary = '';

      switch (fileType) {
        case 'pdf':
          extractedContent = await this.processPDF(fileUrl);
          summary = await openaiUtilsEnhanced.generateDocumentSummary(extractedContent);
          break;
        
        case 'image':
          summary = await this.processImage(fileUrl, fileName);
          break;
        
        case 'video':
          summary = await this.processVideo(fileUrl, fileName);
          break;
        
        default:
          return { success: false, message: `Unsupported file type: ${fileType}` };
      }

      if (!summary || summary.trim().length === 0) {
        return { success: false, message: `No content could be extracted from the ${fileType}` };
      }

      // Update document with summary
      await UserDocument.findByIdAndUpdate(documentId, {
        summary: summary,
        status: 'Completed'
      });

      return { 
        success: true, 
        message: `${fileType.toUpperCase()} processed successfully`, 
        summary 
      };
    } catch (error) {
      console.error('Error processing document:', error);
      
      // Update document status to indicate processing failed
      await UserDocument.findByIdAndUpdate(documentId, {
        status: 'Failed',
        summary: `Processing failed: ${error.message}`
      });

      return { 
        success: false, 
        message: `Processing failed: ${error.message}` 
      };
    }
  }

  /**
   * Determine file type based on extension
   */
  private getFileType(fileName: string): string {
    const extension = path.extname(fileName).toLowerCase();
    
    const fileTypes = {
      // PDF
      '.pdf': 'pdf',
      
      // Images
      '.jpg': 'image',
      '.jpeg': 'image',
      '.png': 'image',
      '.gif': 'image',
      '.bmp': 'image',
      '.webp': 'image',
      '.tiff': 'image',
      '.tif': 'image',
      
      // Videos
      '.mp4': 'video',
      '.avi': 'video',
      '.mov': 'video',
      '.wmv': 'video',
      '.flv': 'video',
      '.webm': 'video',
      '.mkv': 'video',
      '.m4v': 'video',
      '.3gp': 'video',
      '.ogv': 'video'
    };

    return fileTypes[extension] || 'unknown';
  }

  /**
   * Process PDF file
   */
  private async processPDF(fileUrl: string): Promise<string> {
    console.log(`Extracting text from PDF: ${fileUrl}`);
    const extractedText = await extractTextFromPDF(fileUrl);
    
    if (!extractedText || extractedText.trim().length === 0) {
      throw new Error('No text content found in the PDF');
    }
    
    return extractedText;
  }

  /**
   * Process Image file using OpenAI Vision API
   */
  private async processImage(fileUrl: string, fileName: string): Promise<string> {
    console.log(`Processing image with OpenAI Vision: ${fileName}`);
    
    try {
      // Use OpenAI Vision API to analyze the image
      const summary = await openaiUtilsEnhanced.analyzeImage(fileUrl);
      return summary;
    } catch (error) {
      console.error('Error processing image:', error);
      throw new Error(`Failed to analyze image: ${error.message}`);
    }
  }

  /**
   * Process Video file using OpenAI
   */
  private async processVideo(fileUrl: string, fileName: string): Promise<string> {
    console.log(`Processing video: ${fileName}`);
    
    try {
      // For video processing, we'll extract frames and analyze them
      // This is a simplified approach - in production you might want to use video transcription services
      const summary = await openaiUtilsEnhanced.analyzeVideo(fileUrl, fileName);
      return summary;
    } catch (error) {
      console.error('Error processing video:', error);
      throw new Error(`Failed to analyze video: ${error.message}`);
    }
  }

  /**
   * Validate if file type is supported
   */
  isFileTypeSupported(fileName: string): boolean {
    const fileType = this.getFileType(fileName);
    return ['pdf', 'image', 'video'].includes(fileType);
  }

  /**
   * Get supported file extensions
   */
  getSupportedExtensions(): string[] {
    return [
      // PDF
      '.pdf',
      // Images
      '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.tiff', '.tif',
      // Videos
      '.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm', '.mkv', '.m4v', '.3gp', '.ogv'
    ];
  }

  /**
   * Get file type display name
   */
  getFileTypeDisplayName(fileName: string): string {
    const fileType = this.getFileType(fileName);
    const displayNames = {
      'pdf': 'PDF Document',
      'image': 'Image',
      'video': 'Video',
      'unknown': 'Unknown File Type'
    };
    return displayNames[fileType] || 'Unknown File Type';
  }
}

export default new AIServiceEnhanced();
