import { GoogleGenAI } from "@google/genai";
import { ImageStyle } from "../types";

const getAI = (customApiKey?: string) => {
  const apiKey = customApiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }
  return new GoogleGenAI({ apiKey });
};

const getStylePrompt = (style: ImageStyle): string => {
  switch (style) {
    case 'watercolor':
      return "Soft, transparent watercolor painting with delicate brushstrokes, bleeding colors, and a dreamy, artistic feel. High quality, fine art.";
    case 'oil-painting':
      return "Classic oil painting with thick texture, visible impasto brushstrokes, rich deep colors, and a traditional masterpiece feel. High quality, canvas texture.";
    case 'pencil-sketch':
      return "Detailed monochrome pencil sketch, fine graphite lines, realistic shading, hand-drawn charcoal art on textured paper. No colors, black and white only.";
    case 'cyberpunk':
      return "Futuristic cyberpunk city, neon glowing lights in purple and cyan, rainy night, high-tech atmosphere, cinematic lighting, digital art.";
    case 'dreamy':
      return "Surreal and ethereal atmosphere, soft glowing light, floating elements, pastel colors, magical and fantasy-like scenery. High quality, digital art.";
    case 'minimalist':
      return "Clean minimalist design, vast negative space, simple geometric shapes, muted neutral colors, zen-like calm and balance. High quality, modern art.";
    default:
      return "Artistic and atmospheric background.";
  }
};

const generateWithPollinations = async (prompt: string, width: number, height: number): Promise<string> => {
  try {
    // Pollinations works better with descriptive English prompts
    const seed = Math.floor(Math.random() * 1000000);
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${width}&height=${height}&nologo=true&seed=${seed}&model=flux`;
    
    const response = await fetch(url);
    if (!response.ok) throw new Error("Pollinations service unavailable");
    
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.warn("Pollinations failed:", error);
    throw error;
  }
};

const generateWithStockPhoto = async (style: ImageStyle, keyword: string, width: number, height: number): Promise<string> => {
  // Map styles to relevant Unsplash keywords for better fallback
  const styleKeywords: Record<ImageStyle, string> = {
    'watercolor': 'watercolor,painting,art',
    'oil-painting': 'oil-painting,classic-art,canvas',
    'pencil-sketch': 'sketch,drawing,pencil,charcoal',
    'cyberpunk': 'neon,city,night,cyberpunk',
    'dreamy': 'dreamy,ethereal,fantasy,clouds',
    'minimalist': 'minimalist,simple,clean,abstract'
  };

  const searchKeyword = `${styleKeywords[style] || 'nature'},${keyword.split(' ')[0]}`;
  const url = `https://source.unsplash.com/featured/${width}x${height}?${encodeURIComponent(searchKeyword)}`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error("Stock photo service unavailable");
    
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    // Ultimate fallback to a reliable Picsum image with a style-based seed
    return `https://picsum.photos/seed/${style}/${width}/${height}`;
  }
};

export const generatePoemImage = async (poemTitle: string, poemContent: string, style: ImageStyle, customApiKey?: string, provider: 'auto' | 'gemini' | 'pollinations' | 'unsplash' = 'auto'): Promise<string> => {
  const stylePrompt = getStylePrompt(style);
  const promptText = `${stylePrompt} The theme is inspired by a poem titled "${poemTitle}". Atmospheric, evocative, no text, no characters, background only.`;

  if (provider === 'unsplash') {
    return await generateWithStockPhoto(style, poemTitle, 1080, 1920);
  }

  if (provider === 'pollinations') {
    try {
      return await generateWithPollinations(promptText, 1080, 1920);
    } catch (e) {
      console.log("Pollinations failed, using style-aware stock photo fallback...");
      return await generateWithStockPhoto(style, poemTitle, 1080, 1920);
    }
  }

  // 1. Try Gemini (if auto or gemini)
  const ai = getAI(customApiKey);
  if (ai) {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-image",
        contents: [{ text: promptText }],
        config: { imageConfig: { aspectRatio: "9:16" } },
      });
      
      if (response.candidates?.[0]?.content?.parts) {
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
        }
      }
    } catch (e) {
      console.warn("Gemini failed, trying Pollinations...");
      if (provider === 'gemini') {
        throw new Error("Gemini API 호출에 실패했습니다. API 키를 확인하거나 다른 서비스를 선택해주세요.");
      }
    }
  } else if (provider === 'gemini') {
    throw new Error("Gemini API 키가 설정되지 않았습니다.");
  }

  // 2. Try Pollinations (fallback for auto)
  try {
    return await generateWithPollinations(promptText, 1080, 1920);
  } catch (e) {
    // 3. Final Fallback: Stock Photo (now style-aware)
    console.log("All AI services failed, using style-aware stock photo fallback...");
    return await generateWithStockPhoto(style, poemTitle, 1080, 1920);
  }
};

export const generateBookCover = async (bookTitle: string, style: ImageStyle, customApiKey?: string, provider: 'auto' | 'gemini' | 'pollinations' | 'unsplash' = 'auto'): Promise<string> => {
  const stylePrompt = getStylePrompt(style);
  const promptText = `Professional book cover background. ${stylePrompt} Theme: "${bookTitle}". Elegant, artistic, high quality, no text, background only.`;

  if (provider === 'unsplash') {
    return await generateWithStockPhoto(style, bookTitle, 1200, 1600);
  }

  if (provider === 'pollinations') {
    try {
      return await generateWithPollinations(promptText, 1200, 1600);
    } catch (e) {
      console.log("Pollinations failed, using style-aware stock photo fallback...");
      return await generateWithStockPhoto(style, bookTitle, 1200, 1600);
    }
  }

  // 1. Try Gemini (if auto or gemini)
  const ai = getAI(customApiKey);
  if (ai) {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-image",
        contents: [{ text: promptText }],
        config: { imageConfig: { aspectRatio: "3:4" } },
      });
      
      if (response.candidates?.[0]?.content?.parts) {
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData) return `data:image/png;base64,${part.inlineData.data}`;
        }
      }
    } catch (e) {
      console.warn("Gemini failed, trying Pollinations...");
      if (provider === 'gemini') {
        throw new Error("Gemini API 호출에 실패했습니다. API 키를 확인하거나 다른 서비스를 선택해주세요.");
      }
    }
  } else if (provider === 'gemini') {
    throw new Error("Gemini API 키가 설정되지 않았습니다.");
  }

  // 2. Try Pollinations (fallback for auto)
  try {
    return await generateWithPollinations(promptText, 1200, 1600);
  } catch (e) {
    // 3. Final Fallback: Stock Photo (now style-aware)
    console.log("All AI services failed, using style-aware stock photo fallback...");
    return await generateWithStockPhoto(style, bookTitle, 1200, 1600);
  }
};
