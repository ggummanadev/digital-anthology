import { GoogleGenAI } from "@google/genai";
import { ImageStyle } from "../types";

const getAI = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }
  return new GoogleGenAI({ apiKey });
};

export const generatePoemImage = async (poemTitle: string, poemContent: string, style: ImageStyle): Promise<string> => {
  const ai = getAI();
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
  
  for (const part of response.candidates[0].content.parts) {
    if (part.inlineData) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
  }

  throw new Error("Failed to generate image");
};

export const generateBookCover = async (bookTitle: string, style: ImageStyle): Promise<string> => {
  const ai = getAI();
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
  
  for (const part of response.candidates[0].content.parts) {
    if (part.inlineData) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
  }

  throw new Error("Failed to generate cover image");
};
