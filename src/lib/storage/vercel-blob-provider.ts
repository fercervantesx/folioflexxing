import { put, del } from "@vercel/blob";
import { StorageProvider } from "./types";

export class VercelBlobProvider implements StorageProvider {
  private token: string;

  constructor(token: string) {
    this.token = token;
  }

  async uploadFile(path: string, content: Buffer | string, contentType?: string): Promise<string> {
    const blob = await put(path, content, {
      access: "public",
      token: this.token,
      contentType: contentType || "text/html",
      addRandomSuffix: false, // Keep the exact filename
    });
    return blob.url;
  }

  async uploadJSON(path: string, data: any): Promise<string> {
    const content = JSON.stringify(data, null, 2);
    return this.uploadFile(path, content, "application/json");
  }

  getPublicUrl(path: string): string {
    return path;
  }

  async deleteFile(path: string): Promise<void> {
    await del(path, { token: this.token });
  }

  getName(): string {
    return "Vercel Blob";
  }

  isAbsoluteUrl(): boolean {
    return true;
  }
}
