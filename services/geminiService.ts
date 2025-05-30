
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";

// IMPORTANT: The API key MUST be set as an environment variable `process.env.API_KEY`
// This client-side code assumes `process.env.API_KEY` is made available through a build process (e.g., Vite, Webpack)
// or by a script that sets it globally.
// In a typical browser environment, `process.env` is not directly available without such setup.
// If `process.env.API_KEY` is undefined, the service will indicate this.

const API_KEY = process.env.API_KEY;

let ai: GoogleGenAI | null = null;
if (API_KEY) {
  ai = new GoogleGenAI({ apiKey: API_KEY });
}

export const sendQueryToGemini = async (query: string): Promise<string> => {
  if (!API_KEY || !ai) {
    console.warn("Gemini API Key not configured. Set the API_KEY environment variable.");
    return "API Key not configured. This is a demo and requires an API key to function fully.";
  }

  try {
    const model = "gemini-2.5-flash-preview-04-17"; // Recommended model
    
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: model,
      contents: [{
        role: "user", // It's good practice to specify role, 'user' is default if single string content
        parts: [{text: query}] 
      }],
      config: {
        systemInstruction: "You are CargoAGI, an advanced AI specializing in logistics and supply chain management. Provide concise, insightful, and futuristic answers. Your tone should be knowledgeable and slightly formal.",
        temperature: 0.7, // For a balance of creativity and coherence
        topK: 40,
        topP: 0.95,
        // thinkingConfig: { thinkingBudget: 0 } // Disable thinking for faster, lower latency responses if needed. Omit for higher quality.
      }
    });
    
    const text = response.text; // Direct access to text
    if (!text) {
        return "CargoAGI received an empty response. Please try rephrasing your question.";
    }
    return text.trim();

  } catch (error: unknown) {
    console.error("Error calling Gemini API:", error);
    if (error instanceof Error) {
        if (error.message.includes("API_KEY_INVALID") || error.message.includes("API key not valid")) {
             return "Error: The provided Gemini API Key is invalid. Please check your API_KEY environment variable.";
        }
      return `Error communicating with CargoAGI: ${error.message}`;
    }
    return "An unknown error occurred while communicating with CargoAGI.";
  }
};
