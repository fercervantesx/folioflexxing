import Cerebras from "@cerebras/cerebras_cloud_sdk";
import { AIProvider, AIProviderConfig } from "./types";

export class CerebrasProvider implements AIProvider {
  private client: Cerebras;
  private modelId: string;

  constructor(config: AIProviderConfig) {
    this.client = new Cerebras({
      apiKey: config.apiKey
    });
    this.modelId = config.modelId || "llama3.3-70b";
  }

  async generateText(prompt: string): Promise<string> {
    const stream = await this.client.chat.completions.create({
      messages: [
        {
          role: "user",
          content: prompt
        }
      ],
      model: this.modelId,
      stream: true,
      max_completion_tokens: 40960,
      temperature: 0.6,
      top_p: 0.95
    });

    let fullResponse = "";
    for await (const chunk of stream) {
      fullResponse += chunk.choices[0]?.delta?.content || "";
    }

    return fullResponse;
  }

  getName(): string {
    return `Cerebras (${this.modelId})`;
  }
}
