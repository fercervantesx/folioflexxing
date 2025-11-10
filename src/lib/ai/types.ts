export interface AIProvider {
  generateText(prompt: string): Promise<string>;
  getName(): string;
}

export interface AIProviderConfig {
  apiKey: string;
  modelId?: string;
}
