import path from "path";
import { StorageProvider } from "./types";
import { VercelBlobProvider } from "./vercel-blob-provider";
import { LocalStorageProvider } from "./local-provider";

export type StorageType = "vercel-blob" | "local" | "cloudflare-r2";

export class StorageFactory {
  static createProvider(storageType?: StorageType): StorageProvider {
    const type = storageType || (process.env.STORAGE_PROVIDER as StorageType) || "local";

    switch (type) {
      case "vercel-blob": {
        const token = process.env.BLOB_READ_WRITE_TOKEN;
        if (!token) {
          throw new Error("BLOB_READ_WRITE_TOKEN environment variable is not set.");
        }
        return new VercelBlobProvider(token);
      }

      case "local": {
        const baseDir = path.join(process.cwd(), "public", "portfolios");
        const baseUrl = "/portfolios";
        return new LocalStorageProvider(baseDir, baseUrl);
      }

      case "cloudflare-r2": {
        throw new Error("Cloudflare R2 provider not yet implemented. Use 'vercel-blob' or 'local'.");
      }

      default:
        throw new Error(`Unknown storage provider: ${type}`);
    }
  }

  static getDefaultProvider(): StorageProvider {
    return this.createProvider();
  }
}
