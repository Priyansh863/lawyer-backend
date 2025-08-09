import UserDocument from '../models/user_documents';
import { extractTextFromPDF, isPDFFile } from '../utils/pdfUtils';
import openaiUtils from '../utils/openaiUtils';
import path from 'path';


class AIService {
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
        summary = await openaiUtils.generateDocumentSummary(extractedContent);
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
    const summary = await openaiUtils.analyzeImage(fileUrl, fileName);
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
    const summary = await openaiUtils.analyzeVideo(fileUrl, fileName);
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

  /**
   * Process multiple documents in batch
   */
  async processBatchDocuments(documentIds: string[]): Promise<Array<{ documentId: string; success: boolean; message: string; summary?: string }>> {
    const results = [];
    
    for (const documentId of documentIds) {
      try {
        console.log(`Processing document ${documentId} in batch...`);
        const result = await this.processDocument(documentId);
        results.push({
          documentId,
          ...result
        });
      } catch (error) {
        console.error(`Batch processing failed for document ${documentId}:`, error);
        results.push({
          documentId,
          success: false,
          message: `Batch processing failed: ${error.message}`
        });
      }
    }
    
    return results;
  }

  /**
   * Generate marketing post content using OpenAI with a well-crafted prompt
   */
  async generateMarketingPost(userPrompt: string): Promise<{ success: boolean; message?: string; content?: string }> {
    try {
      // Craft a comprehensive prompt for legal marketing content
      const systemPrompt = `You are an expert legal marketing content creator specializing in creating engaging, professional, and compliant social media posts for law firms and legal professionals.

Your task is to create compelling marketing content that:
- Is professional and trustworthy
- Follows legal advertising ethics and compliance guidelines
- Engages the target audience (potential clients, other lawyers, legal professionals)
- Uses appropriate legal terminology without being overly complex
- Includes relevant hashtags for legal marketing
- Is optimized for social media platforms
- Provides value to readers (educational, informative, or newsworthy)
- Maintains a balance between promotional and informational content

Content should be:
- Clear and concise
- Engaging and shareable
- Compliant with legal advertising rules
- Professional in tone
- Include relevant emojis where appropriate
- End with 3-5 relevant hashtags

User's request: ${userPrompt}

Generate a professional legal marketing post based on this request.`;

      console.log('Generating marketing post with OpenAI...');
      const content = await openaiUtils.generateMarketingContent(systemPrompt);

      if (!content || content.trim().length === 0) {
        return { 
          success: false, 
          message: 'No content generated from OpenAI' 
        };
      }

      return { 
        success: true, 
        content: content.trim()
      };
    } catch (error) {
      console.error('Error generating marketing post:', error);
      return { 
        success: false, 
        message: `Failed to generate marketing post: ${error.message}` 
      };
    }
  }
}

export default new AIService();
