import { GoogleGenAI } from "@google/genai";
import { ImageStyle } from "../types";

const getAI = (customApiKey?: string) => {
  const apiKey = customApiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }
  return new GoogleGenAI({ apiKey });
};

const generateWithPollinations = async (prompt: string, width: number, height: number): Promise<string> => {
  const encodedPrompt = encodeURIComponent(prompt);
  const seed = Math.floor(Math.random() * 1000000);
  const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&nologo=true&seed=${seed}`;
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("무료 이미지 생성 서비스(Pollinations) 호출에 실패했습니다.");
  }
  
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

export const generatePoemImage = async (poemTitle: string, poemContent: string, style: ImageStyle, customApiKey?: string): Promise<string> => {
  const promptText = `Create an artistic background image for a poem. Title: ${poemTitle}. Content: ${poemContent.substring(0, 100)}... Style: ${style}. The image should be atmospheric, evocative, and leave some space for text overlay. Do not include any text in the image itself.`;

  try {
    const ai = getAI(customApiKey);
    if (ai) {
      try {
        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash-image",
          contents: [{ text: promptText }],
          config: { imageConfig: { aspectRatio: "9:16" } },
        });
        
        if (response.candidates && response.candidates.length > 0) {
          for (const part of response.candidates[0].content.parts) {
            if (part.inlineData) {
              return `data:image/png;base64,${part.inlineData.data}`;
            }
          }
        }
      } catch (geminiError: any) {
        console.warn("Gemini Image Generation Error, falling back to Pollinations:", geminiError);
      }
    }
    
    // Fallback to Pollinations
    console.log("Using Pollinations.ai for image generation...");
    return await generateWithPollinations(promptText, 1080, 1920);
    
  } catch (error: any) {
    console.error("Image Generation Error:", error);
    throw new Error(`이미지 생성 중 오류가 발생했습니다: ${error instanceof Error ? error.message : String(error)}`);
  }
};

export const generateBookCover = async (bookTitle: string, style: ImageStyle, customApiKey?: string): Promise<string> => {
  const promptText = `Create a beautiful book cover background for a poetry anthology titled "${bookTitle}". Style: ${style}. The image should be elegant, artistic, and suitable for a book cover. Do not include any text in the image itself.`;

  try {
    const ai = getAI(customApiKey);
    if (ai) {
      try {
        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash-image",
          contents: [{ text: promptText }],
          config: { imageConfig: { aspectRatio: "3:4" } },
        });
        
        if (response.candidates && response.candidates.length > 0) {
          for (const part of response.candidates[0].content.parts) {
            if (part.inlineData) {
              return `data:image/png;base64,${part.inlineData.data}`;
            }
          }
        }
      } catch (geminiError: any) {
        console.warn("Gemini Cover Generation Error, falling back to Pollinations:", geminiError);
      }
    }
    
    // Fallback to Pollinations
    console.log("Using Pollinations.ai for cover generation...");
    return await generateWithPollinations(promptText, 1200, 1600);
    
  } catch (error: any) {
    console.error("Cover Generation Error:", error);
    throw new Error(`표지 생성 중 오류가 발생했습니다: ${error instanceof Error ? error.message : String(error)}`);
  }
};
