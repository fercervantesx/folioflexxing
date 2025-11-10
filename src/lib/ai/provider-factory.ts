import { AIProvider } from "./types";
import { GeminiProvider } from "./gemini-provider";
import { CerebrasProvider } from "./cerebras-provider";

export type ProviderType = "gemini" | "cerebras";

export class AIProviderFactory {
  static createProvider(providerType: ProviderType): AIProvider {
    switch (providerType) {
      case "gemini": {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
          throw new Error("GEMINI_API_KEY environment variable is not set.");
        }
        return new GeminiProvider({ apiKey });
      }
      case "cerebras": {
        const apiKey = process.env.CEREBRAS_API_KEY;
        if (!apiKey) {
          throw new Error("CEREBRAS_API_KEY environment variable is not set.");
        }
        const modelId = process.env.CEREBRAS_MODEL_ID;
        return new CerebrasProvider({ apiKey, modelId });
      }
      default:
        throw new Error(`Unknown AI provider: ${providerType}`);
    }
  }

  static getDefaultProvider(): AIProvider {
    const providerType = (process.env.AI_PROVIDER || "cerebras") as ProviderType;
    return this.createProvider(providerType);
  }
}
