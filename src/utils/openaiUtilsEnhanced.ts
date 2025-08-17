import OpenAI from 'openai';
import dbConfig from "../config/secretManagerConfig";

class OpenAIUtilsEnhanced {
  private openai: OpenAI;

  constructor() {
    // Constructor will be called when the class is instantiated
  }

  async init(): Promise<void> {
    const dbData = await dbConfig.secretManagerConnection();
    this.openai = new OpenAI({
      apiKey: dbData.openaiApiKey,
    });
  }

  /**
   * Generate summary using OpenAI GPT with multi-language support
   */
  async generateDocumentSummary(text: string, language: string = 'en'): Promise<string> {
    try {
      // Limit text length to avoid token limits
      const maxLength = 15000;
      const truncatedText = text.length > maxLength ? text.substring(0, maxLength) + '...' : text;

      // Multi-language prompts
      const prompts = {
        en: "You are a legal document analyzer. Provide a concise, professional summary of the document content focusing on key legal points, important dates, parties involved, and main objectives. Keep the summary under 500 words.",
        ko: "당신은 법률 문서 분석가입니다. 주요 법적 요점, 중요한 날짜, 관련 당사자 및 주요 목표에 초점을 맞춘 문서 내용의 간결하고 전문적인 요약을 제공하십시오. 요약을 500단어 이하로 유지하십시오.",
        es: "Eres un analizador de documentos legales. Proporciona un resumen conciso y profesional del contenido del documento enfocándote en puntos legales clave, fechas importantes, partes involucradas y objetivos principales. Mantén el resumen bajo 500 palabras.",
        fr: "Vous êtes un analyseur de documents juridiques. Fournissez un résumé concis et professionnel du contenu du document en vous concentrant sur les points juridiques clés, les dates importantes, les parties impliquées et les objectifs principaux. Gardez le résumé sous 500 mots.",
        de: "Sie sind ein Rechtsanalyst. Erstellen Sie eine prägnante, professionelle Zusammenfassung des Dokumentinhalts mit Fokus auf wichtige rechtliche Punkte, wichtige Daten, beteiligte Parteien und Hauptziele. Halten Sie die Zusammenfassung unter 500 Wörtern.",
        ja: "あなたは法的文書アナリストです。主要な法的ポイント、重要な日付、関係者、主要な目的に焦点を当てた文書内容の簡潔で専門的な要約を提供してください。要約は500語以下に保ってください。"
      };

      const systemPrompt = prompts[language] || prompts.en;

      const completion = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: systemPrompt
          },
          {
            role: "user",
            content: `Please provide a summary of the following document:\n\n${truncatedText}`
          }
        ],
        max_tokens: 600,
        temperature: 0.3,
      });

      return completion.choices[0]?.message?.content || 'Unable to generate summary';
    } catch (error) {
      console.error('Error generating summary with OpenAI:', error);
      throw new Error(`Failed to generate summary: ${error.message}`);
    }
  }

  /**
   * Analyze image using OpenAI Vision API
   */
  async analyzeImage(imageUrl: string, language: string = 'en'): Promise<string> {
    try {
      // Multi-language prompts for image analysis
      const prompts = {
        en: "Analyze this image and provide a detailed description. If it contains text, extract and summarize the key information. If it's a legal document, focus on important legal elements, dates, parties, and main content. Provide a comprehensive summary under 500 words.",
        ko: "이 이미지를 분석하고 자세한 설명을 제공하십시오. 텍스트가 포함되어 있으면 주요 정보를 추출하고 요약하십시오. 법률 문서인 경우 중요한 법적 요소, 날짜, 당사자 및 주요 내용에 초점을 맞추십시오. 500단어 이하의 포괄적인 요약을 제공하십시오.",
        es: "Analiza esta imagen y proporciona una descripción detallada. Si contiene texto, extrae y resume la información clave. Si es un documento legal, enfócate en elementos legales importantes, fechas, partes y contenido principal. Proporciona un resumen completo bajo 500 palabras.",
        fr: "Analysez cette image et fournissez une description détaillée. Si elle contient du texte, extrayez et résumez les informations clés. Si c'est un document juridique, concentrez-vous sur les éléments juridiques importants, les dates, les parties et le contenu principal. Fournissez un résumé complet sous 500 mots.",
        de: "Analysieren Sie dieses Bild und geben Sie eine detaillierte Beschreibung. Wenn es Text enthält, extrahieren und fassen Sie die wichtigsten Informationen zusammen. Wenn es sich um ein Rechtsdokument handelt, konzentrieren Sie sich auf wichtige rechtliche Elemente, Daten, Parteien und Hauptinhalt. Geben Sie eine umfassende Zusammenfassung unter 500 Wörtern.",
        ja: "この画像を分析し、詳細な説明を提供してください。テキストが含まれている場合は、重要な情報を抽出して要約してください。法的文書の場合は、重要な法的要素、日付、当事者、主要内容に焦点を当ててください。500語以下の包括的な要約を提供してください。"
      };

      const userPrompt = prompts[language] || prompts.en;

      const completion = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: userPrompt
              },
              {
                type: "image_url",
                image_url: {
                  url: imageUrl,
                  detail: "high"
                }
              }
            ]
          }
        ],
        max_tokens: 600,
        temperature: 0.3,
      });

      return completion.choices[0]?.message?.content || 'Unable to analyze image';
    } catch (error) {
      console.error('Error analyzing image with OpenAI:', error);
      throw new Error(`Failed to analyze image: ${error.message}`);
    }
  }

  /**
   * Analyze video (simplified approach - analyze video metadata and description)
   */
  async analyzeVideo(videoUrl: string, fileName: string, language: string = 'en'): Promise<string> {
    try {
      // Multi-language prompts for video analysis
      const prompts = {
        en: "Based on the video file information provided, generate a professional summary. Since this is a video file, provide insights about what type of content it might contain based on the filename and context. If this is related to legal proceedings, depositions, or legal presentations, mention the potential legal significance. Keep the summary under 500 words.",
        ko: "제공된 비디오 파일 정보를 바탕으로 전문적인 요약을 생성하십시오. 이것이 비디오 파일이므로 파일 이름과 컨텍스트를 기반으로 어떤 유형의 콘텐츠가 포함될 수 있는지에 대한 통찰력을 제공하십시오. 법적 절차, 증언 또는 법적 프레젠테이션과 관련된 경우 잠재적인 법적 중요성을 언급하십시오. 요약을 500단어 이하로 유지하십시오.",
        es: "Basándose en la información del archivo de video proporcionada, genere un resumen profesional. Dado que este es un archivo de video, proporcione información sobre qué tipo de contenido podría contener basándose en el nombre del archivo y el contexto. Si está relacionado con procedimientos legales, deposiciones o presentaciones legales, mencione la importancia legal potencial. Mantenga el resumen bajo 500 palabras.",
        fr: "Sur la base des informations du fichier vidéo fournies, générez un résumé professionnel. Puisqu'il s'agit d'un fichier vidéo, fournissez des informations sur le type de contenu qu'il pourrait contenir en fonction du nom de fichier et du contexte. S'il est lié à des procédures juridiques, des dépositions ou des présentations juridiques, mentionnez l'importance juridique potentielle. Gardez le résumé sous 500 mots.",
        de: "Erstellen Sie basierend auf den bereitgestellten Videodatei-Informationen eine professionelle Zusammenfassung. Da dies eine Videodatei ist, geben Sie Einblicke darüber, welche Art von Inhalt sie basierend auf dem Dateinamen und Kontext enthalten könnte. Wenn es sich auf rechtliche Verfahren, Aussagen oder rechtliche Präsentationen bezieht, erwähnen Sie die potenzielle rechtliche Bedeutung. Halten Sie die Zusammenfassung unter 500 Wörtern.",
        ja: "提供されたビデオファイル情報に基づいて、プロフェッショナルな要約を生成してください。これはビデオファイルなので、ファイル名とコンテキストに基づいてどのような種類のコンテンツが含まれている可能性があるかについての洞察を提供してください。法的手続き、証言、または法的プレゼンテーションに関連している場合は、潜在的な法的重要性について言及してください。要約を500語以下に保ってください。"
      };

      const systemPrompt = prompts[language] || prompts.en;

      const completion = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: systemPrompt
          },
          {
            role: "user",
            content: `Analyze this video file:
            
Filename: ${fileName}
Video URL: ${videoUrl}
File Type: Video file

Please provide a professional analysis and summary of what this video might contain based on the available information. Consider legal context if applicable.`
          }
        ],
        max_tokens: 600,
        temperature: 0.3,
      });

      return completion.choices[0]?.message?.content || 'Unable to analyze video';
    } catch (error) {
      console.error('Error analyzing video with OpenAI:', error);
      throw new Error(`Failed to analyze video: ${error.message}`);
    }
  }

  /**
   * Generate blog content with multi-language support
   */
  async generateBlogContent(topic: string, language: string = 'en', hashtags: string[] = [], citations: string[] = []): Promise<string> {
    try {
      const prompts = {
        en: "You are a professional content writer. Create engaging, informative blog content that is SEO-optimized and reader-friendly. Include relevant hashtags and citations where appropriate.",
        ko: "당신은 전문 콘텐츠 작가입니다. SEO에 최적화되고 독자 친화적인 매력적이고 유익한 블로그 콘텐츠를 만드십시오. 적절한 경우 관련 해시태그와 인용을 포함하십시오.",
        es: "Eres un escritor de contenido profesional. Crea contenido de blog atractivo e informativo que esté optimizado para SEO y sea amigable para el lector. Incluye hashtags relevantes y citas cuando sea apropiado.",
        fr: "Vous êtes un rédacteur de contenu professionnel. Créez du contenu de blog engageant et informatif qui est optimisé pour le SEO et convivial pour le lecteur. Incluez des hashtags pertinents et des citations le cas échéant.",
        de: "Sie sind ein professioneller Content-Writer. Erstellen Sie ansprechende, informative Blog-Inhalte, die SEO-optimiert und leserfreundlich sind. Fügen Sie relevante Hashtags und Zitate hinzu, wo angemessen.",
        ja: "あなたはプロのコンテンツライターです。SEOに最適化され、読者にとって使いやすい魅力的で有益なブログコンテンツを作成してください。適切な場合は関連するハッシュタグと引用を含めてください。"
      };

      const systemPrompt = prompts[language] || prompts.en;

      let userPrompt = `Create a comprehensive blog post about: ${topic}`;
      
      if (hashtags.length > 0) {
        userPrompt += `\n\nInclude these hashtags: ${hashtags.join(', ')}`;
      }
      
      if (citations.length > 0) {
        userPrompt += `\n\nReference these sources: ${citations.join(', ')}`;
      }

      const completion = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: systemPrompt
          },
          {
            role: "user",
            content: userPrompt
          }
        ],
        max_tokens: 1500,
        temperature: 0.7,
      });

      return completion.choices[0]?.message?.content || 'Unable to generate blog content';
    } catch (error) {
      console.error('Error generating blog content with OpenAI:', error);
      throw new Error(`Failed to generate blog content: ${error.message}`);
    }
  }

  /**
   * Generate URL content with multi-language support
   */
  async generateUrlContent(
    url: string, 
    description: string, 
    language: string = 'en',
    hashtags: string[] = [],
    citations: string[] = [],
    floor: string = '',
    address: string = ''
  ): Promise<string> {
    try {
      const prompts = {
        en: "You are a professional marketing content creator. Generate engaging, SEO-optimized content for URL sharing that includes relevant details, hashtags, and location information when provided.",
        ko: "당신은 전문 마케팅 콘텐츠 크리에이터입니다. 관련 세부 정보, 해시태그 및 위치 정보가 제공될 때 이를 포함하는 URL 공유를 위한 매력적이고 SEO에 최적화된 콘텐츠를 생성하십시오.",
        es: "Eres un creador de contenido de marketing profesional. Genera contenido atractivo y optimizado para SEO para compartir URL que incluya detalles relevantes, hashtags e información de ubicación cuando se proporcione.",
        fr: "Vous êtes un créateur de contenu marketing professionnel. Générez du contenu engageant et optimisé pour le SEO pour le partage d'URL qui inclut des détails pertinents, des hashtags et des informations de localisation lorsqu'elles sont fournies.",
        de: "Sie sind ein professioneller Marketing-Content-Ersteller. Generieren Sie ansprechende, SEO-optimierte Inhalte für URL-Sharing, die relevante Details, Hashtags und Standortinformationen enthalten, wenn bereitgestellt.",
        ja: "あなたはプロのマーケティングコンテンツクリエイターです。関連する詳細、ハッシュタグ、および提供された場合の位置情報を含む、URL共有のための魅力的でSEOに最適化されたコンテンツを生成してください。"
      };

      const systemPrompt = prompts[language] || prompts.en;

      let userPrompt = `Create marketing content for this URL: ${url}\nDescription: ${description}`;
      
      if (hashtags.length > 0) {
        userPrompt += `\n\nInclude these hashtags: ${hashtags.join(', ')}`;
      }
      
      if (citations.length > 0) {
        userPrompt += `\n\nReference these sources: ${citations.join(', ')}`;
      }

      if (floor) {
        userPrompt += `\n\nFloor: ${floor}`;
      }

      if (address) {
        userPrompt += `\n\nAddress: ${address}`;
      }

      const completion = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: systemPrompt
          },
          {
            role: "user",
            content: userPrompt
          }
        ],
        max_tokens: 800,
        temperature: 0.7,
      });

      return completion.choices[0]?.message?.content || 'Unable to generate URL content';
    } catch (error) {
      console.error('Error generating URL content with OpenAI:', error);
      throw new Error(`Failed to generate URL content: ${error.message}`);
    }
  }
}

export default new OpenAIUtilsEnhanced();
