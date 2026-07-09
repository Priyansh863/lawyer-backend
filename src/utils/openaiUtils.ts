import OpenAI from "openai";
import dbConfig from "../config/secretManagerConfig";
import fetch from "node-fetch";
import fs from "fs";
import path from "path";

class OpenAIUtils {
  private openai: OpenAI | null = null;
  private initPromise: Promise<void> | null = null;
  private initialized: boolean = false;

  constructor() {
    // Lazy initialize to avoid running async code during import / test bootstrap
  }

  private async init(): Promise<void> {
    try {
      const dbData = await dbConfig.secretManagerConnection();

      if (!dbData.openaiApiKey) {
        throw new Error("OpenAI API key not found in configuration");
      }

      this.openai = new OpenAI({
        apiKey: dbData.openaiApiKey,
      });

      this.initialized = true;
      console.log("OpenAI client initialized successfully");
    } catch (error) {
      console.error("Failed to initialize OpenAI client:", error);
      this.initialized = false;
      this.openai = null;
      throw error;
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized && !this.initPromise) {
      this.initPromise = this.init();
    }
    if (this.initPromise) {
      try {
        await this.initPromise;
      } catch (error) {
        this.initPromise = null;
        throw error;
      }
      this.initPromise = null;
    }

    if (!this.initialized || !this.openai) {
      throw new Error("OpenAI client not properly initialized");
    }
  }

  /**
   * Detect whether text is English or Korean
   */
  private async detectLanguage(text: string): Promise<"english" | "korean" | "unknown"> {
    const completion = await this.openai!.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a language detector. Reply with only 'english' if the text is primarily English, 'korean' if it's primarily Korean, otherwise 'unknown'."
        },
        { role: "user", content: text.slice(0, 500) }
      ],
      max_tokens: 5,
      temperature: 0
    });

    const lang = completion.choices[0]?.message?.content?.trim().toLowerCase();
    if (lang === "english") return "english";
    if (lang === "korean") return "korean";
    return "unknown";
  }

  /**
   * Summarize in the same language as detected
   */
  private async summarizeInDetectedLanguage(content: string, type: string): Promise<string> {
    const lang = await this.detectLanguage(content);

    const completion = await this.openai!.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are a ${lang === "english" ? "English" : lang === "korean" ? "Korean" : "English"} summarizer. Summarize the following ${type} in the same language as the original. Keep it professional and concise.`
        },
        { role: "user", content }
      ],
      max_tokens: 600,
      temperature: 0.3
    });

    return completion.choices[0]?.message?.content || "Unable to generate summary";
  }

  /**
   * Download file from URL
   */
  private async downloadFile(url: string, ext: string): Promise<string> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to download file: ${res.statusText}`);

    const tempPath = path.join("/tmp", `media_${Date.now()}${ext}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(tempPath, buffer);
    return tempPath;
  }

  /**
   * Transcribe audio
   */
  private async transcribeAudio(filePath: string): Promise<string> {
    const transcription = await this.openai!.audio.transcriptions.create({
      file: fs.createReadStream(filePath),
      model: "gpt-4o-mini-transcribe"
    });

    return transcription.text || "";
  }

  /**
   * Document summary
   */
  async generateDocumentSummary(text: string): Promise<string> {
    try {
      await this.ensureInitialized();
      const maxLength = 15000;
      const truncatedText = text.length > maxLength ? text.substring(0, maxLength) + "..." : text;
      return await this.summarizeInDetectedLanguage(truncatedText, "document");
    } catch (error: any) {
      console.error("Error generating document summary:", error);
      throw new Error(`Failed to generate summary: ${error.message}`);
    }
  }

  /**
   * Image analysis (textual description in same language as detected)
   */
  async analyzeImage(imageUrl: string, fileName: string): Promise<string> {
    try {
      await this.ensureInitialized();

      const completion = await this.openai!.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content:
              "You are a helpful image describer. Analyze the provided image and describe it in the same language as the detected content (English or Korean)."
          },
          {
            role: "user",
            content: [
              { type: "text", text: `Image file: ${fileName} at ${imageUrl}` },
              { type: "image_url", image_url: { url: imageUrl } }
            ]
          }
        ],
        max_tokens: 400,
        temperature: 0.3
      });

      return completion.choices[0]?.message?.content || "Unable to analyze image";
    } catch (error) {
      console.error("Error analyzing image:", error);
      return `Image analysis: ${fileName} - Unable to analyze.`;
    }
  }

  /**
 * Analyze video from a URL.
 * Primary: Try to extract audio → detect language → summarize.
 * Fallback: Infer summary from file name if audio can't be processed.
 */
async analyzeVideo(videoUrl: string, fileName: string): Promise<string> {
  try {
    await this.ensureInitialized();

    console.log("Analyzing video:", videoUrl);

    const completion = await this.openai!.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `
            You are a helpful and descriptive media summarizer.
            You are given a video file link. 
            First, attempt to extract the audio from the video, detect the spoken language, and then generate a summary in the same language.
            - If the audio is in English, provide the summary in English.
            - If the audio is in Korean, provide the summary in Korean.
            Focus on capturing the main events, topics, and context from the video content.
            
            If you cannot extract the audio or detect the spoken language (e.g., inaccessible file, unsupported format):
            - Look at the video file name: "${fileName}".
            - Try to infer a plausible summary from the file name and any context it might give.
            - Clearly indicate that this summary is inferred from the file name, not actual video analysis.
          `
        },
        {
          role: "user",
          content: `Here is a video to analyze: ${videoUrl}. The file name is "${fileName}".`
        }
      ],
      max_tokens: 200,
      temperature: 0.3
    });

    const result =
      completion.choices[0]?.message?.content?.trim() ||
      `Video analysis unavailable for file: ${fileName}.`;

    return result;
  } catch (error) {
    console.error("Error analyzing video:", error);
    return `Video file detected: ${fileName} - Unable to automatically analyze video content.`;
  }
}


  /**
   * Marketing content (same language as prompt)
   */
  async generateMarketingContent(prompt: string): Promise<string> {
    try {
      await this.ensureInitialized();
      return await this.summarizeInDetectedLanguage(prompt, "marketing content");
    } catch (error: any) {
      console.error("Error generating marketing content:", error);
      throw new Error(`Failed to generate marketing content: ${error.message}`);
    }
  }

  /**
   * Check API key
   */
  isConfigured(): boolean {
    return !!process.env.OPENAI_API_KEY;
  }
}

export default new OpenAIUtils();
