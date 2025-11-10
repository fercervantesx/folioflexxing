export interface StorageProvider {
  uploadFile(path: string, content: Buffer | string, contentType?: string): Promise<string>;
  uploadJSON(path: string, data: any): Promise<string>;
  getPublicUrl(path: string): string;
  deleteFile(path: string): Promise<void>;
  getName(): string;
}

export interface StorageConfig {
  provider: string;
}

export interface PortfolioFiles {
  htmlUrl: string;
  imageUrl?: string;
  metadataUrl: string;
}
