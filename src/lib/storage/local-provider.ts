import fs from "fs/promises";
import path from "path";
import { StorageProvider } from "./types";

export class LocalStorageProvider implements StorageProvider {
  private baseDir: string;
  private baseUrl: string;

  constructor(baseDir: string, baseUrl: string = "") {
    this.baseDir = baseDir;
    this.baseUrl = baseUrl;
  }

  async uploadFile(filePath: string, content: Buffer | string, contentType?: string): Promise<string> {
    const fullPath = path.join(this.baseDir, filePath);
    const dir = path.dirname(fullPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(fullPath, content);
    return this.getPublicUrl(filePath);
  }

  async uploadJSON(filePath: string, data: any): Promise<string> {
    const content = JSON.stringify(data, null, 2);
    return this.uploadFile(filePath, content, "application/json");
  }

  getPublicUrl(filePath: string): string {
    return `${this.baseUrl}/${filePath}`;
  }

  async deleteFile(filePath: string): Promise<void> {
    const fullPath = path.join(this.baseDir, filePath);
    await fs.unlink(fullPath);
  }

  getName(): string {
    return "Local Storage";
  }
}
