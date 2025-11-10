import { GoogleGenerativeAI } from "@google/generative-ai";
import { AIProvider, AIProviderConfig } from "./types";

export class GeminiProvider implements AIProvider {
  private client: GoogleGenerativeAI;
  private model: any;

  constructor(config: AIProviderConfig) {
    this.client = new GoogleGenerativeAI(config.apiKey);
    this.model = this.client.getGenerativeModel({ model: "gemini-2.0-flash-exp" });
  }

  async generateText(prompt: string): Promise<string> {
    const result = await this.model.generateContent(prompt);
    return result.response.text();
  }

  getName(): string {
    return "Gemini";
  }
}
