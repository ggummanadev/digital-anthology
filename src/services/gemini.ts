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
  try {
    const encodedPrompt = encodeURIComponent(prompt);
    const seed = Math.floor(Math.random() * 1000000);
    const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&nologo=true&seed=${seed}`;
    
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
    console.warn("Pollinations failed, falling back to Unsplash/Picsum:", error);
    throw error;
  }
};

const generateWithStockPhoto = async (keyword: string, width: number, height: number): Promise<string> => {
  // Picsum is extremely reliable as a final fallback
  const seed = encodeURIComponent(keyword.split(' ')[0] || 'nature');
  const url = `https://picsum.photos/seed/${seed}/${width}/${height}`;
  
  const response = await fetch(url);
  if (!response.ok) {
    // Ultimate fallback to a static high-quality nature image if even Picsum fails
    return "https://images.unsplash.com/photo-1501854140801-50d01698950b?auto=format&fit=crop&w=1000&q=80";
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
  const promptText = `Artistic background for poem: ${poemTitle}. Style: ${style}. Atmospheric, no text.`;

  // 1. Try Gemini
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
    }
  }

  // 2. Try Pollinations
  try {
    return await generateWithPollinations(promptText, 1080, 1920);
  } catch (e) {
    // 3. Final Fallback: Stock Photo
    console.log("All AI services failed, using high-quality stock photo fallback...");
    return await generateWithStockPhoto(`${style} ${poemTitle}`, 1080, 1920);
  }
};

export const generateBookCover = async (bookTitle: string, style: ImageStyle, customApiKey?: string): Promise<string> => {
  const promptText = `Elegant book cover for poetry anthology: ${bookTitle}. Style: ${style}. No text.`;

  // 1. Try Gemini
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
    }
  }

  // 2. Try Pollinations
  try {
    return await generateWithPollinations(promptText, 1200, 1600);
  } catch (e) {
    // 3. Final Fallback: Stock Photo
    console.log("All AI services failed, using high-quality stock photo fallback...");
    return await generateWithStockPhoto(`${style} book cover`, 1200, 1600);
  }
};
