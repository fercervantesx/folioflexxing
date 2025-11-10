export interface StorageProvider {
  uploadFile(path: string, content: Buffer | string, contentType?: string): Promise<string>;
  uploadJSON(path: string, data: any): Promise<string>;
  getPublicUrl(path: string): string;
  deleteFile(path: string): Promise<void>;
  getName(): string;
  isAbsoluteUrl(): boolean; // Returns true if URLs from this provider are absolute (http/https)
}

export interface StorageConfig {
  provider: string;
}

export interface PortfolioFiles {
  htmlUrl: string;
  imageUrl?: string;
  metadataUrl: string;
}
