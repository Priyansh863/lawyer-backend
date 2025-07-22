import UserDocument from '../models/user_documents';
import { extractTextFromPDF, isPDFFile } from '../utils/pdfUtils';
import openaiUtils from '../utils/openaiUtils';

class AIService {

  /**
   * Process document: extract text and generate summary (PDF only)
   */
  async processDocument(documentId: string): Promise<{ success: boolean; message: string; summary?: string }> {
    try {
      // Check if OpenAI is configure

      // Find the document
      const document = await UserDocument.findById(documentId);
      if (!document) {
        return { success: false, message: 'Document not found' };
      }

      // Extract text from PDF
      console.log(`Extracting text from PDF: ${document.document_name}`);
      const extractedText = await extractTextFromPDF(document.link);

      console.log(`Extracted text: ${extractedText}`);
      
      if (!extractedText || extractedText.trim().length === 0) {
        return { success: false, message: 'No text content found in the PDF' };
      }

      // Generate summary using OpenAI
      console.log('Generating summary with OpenAI...');
      const summary = await openaiUtils.generateDocumentSummary(extractedText);

      // Update document with summary
      await UserDocument.findByIdAndUpdate(documentId, {
        summary: summary,
        status: 'Approved' // Assuming successful processing means approved
      });

      return { 
        success: true, 
        message: 'Document processed successfully', 
        summary 
      };
    } catch (error) {
      console.error('Error processing document:', error);
      
      // Update document status to indicate processing failed
      await UserDocument.findByIdAndUpdate(documentId, {
        status: 'Rejected',
        summary: `Processing failed: ${error.message}`
      });

      return { 
        success: false, 
        message: `Failed to process document: ${error.message}` 
      };
    }
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
