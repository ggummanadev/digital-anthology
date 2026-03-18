import { GoogleGenAI } from "@google/genai";
import { ImageStyle } from "../types";

const getAI = (customApiKey?: string) => {
  const apiKey = customApiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured. Please set it in Settings.");
  }
  return new GoogleGenAI({ apiKey });
};

export const generatePoemImage = async (poemTitle: string, poemContent: string, style: ImageStyle, customApiKey?: string): Promise<string> => {
  try {
    const ai = getAI(customApiKey);
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-image",
      contents: [
        {
          text: `Create an artistic background image for a poem. 
          Title: ${poemTitle}
          Content: ${poemContent}
          Style: ${style}
          The image should be atmospheric, evocative, and leave some space for text overlay. 
          Do not include any text in the image itself.`,
        },
      ],
      config: {
        imageConfig: {
          aspectRatio: "9:16",
        },
      },
    });
    
    if (!response.candidates || response.candidates.length === 0) {
      throw new Error("이미지 생성 결과가 없습니다. (안전 필터에 의해 차단되었을 수 있습니다)");
    }

    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }

    throw new Error("생성된 이미지 데이터를 찾을 수 없습니다.");
  } catch (error) {
    console.error("Gemini Image Generation Error:", error);
    if (error instanceof Error) {
      if (error.message.includes("API_KEY_INVALID")) {
        throw new Error("API 키가 유효하지 않습니다. 설정을 확인해주세요.");
      }
      throw error;
    }
    throw new Error("이미지 생성 중 알 수 없는 오류가 발생했습니다.");
  }
};

export const generateBookCover = async (bookTitle: string, style: ImageStyle, customApiKey?: string): Promise<string> => {
  try {
    const ai = getAI(customApiKey);
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-image",
      contents: [
        {
          text: `Create a beautiful book cover background for a poetry anthology titled "${bookTitle}".
          Style: ${style}
          The image should be elegant, artistic, and suitable for a book cover.
          Do not include any text in the image itself.`,
        },
      ],
      config: {
        imageConfig: {
          aspectRatio: "3:4",
        },
      },
    });
    
    if (!response.candidates || response.candidates.length === 0) {
      throw new Error("표지 이미지 생성 결과가 없습니다.");
    }

    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }

    throw new Error("생성된 표지 이미지 데이터를 찾을 수 없습니다.");
  } catch (error) {
    console.error("Gemini Cover Generation Error:", error);
    if (error instanceof Error) throw error;
    throw new Error("표지 생성 중 알 수 없는 오류가 발생했습니다.");
  }
};
