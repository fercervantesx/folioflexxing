# FolioFlexxing 🎨

Transform PDF resumes into stunning, professional portfolio websites using AI - automatically.

## ✨ Features

- **🤖 AI-Powered Generation**: Uses Cerebras or Gemini AI to extract resume data and generate beautiful HTML portfolios
- **🎨 Multiple Templates**: 6 professionally designed templates (Elegant Serif, Bold Typography, Minimal Cards, Dark Modern, Venice Inspired, Bento Grid)
- **📸 Profile Image Support**: Optional image upload with intelligent placement
- **✅ Smart Validation**: AI validates PDFs are actually resumes (not books, papers, etc.)
- **🔒 Rate Limited**: Built-in rate limiting with Upstash Redis
- **📝 Portfolio History**: Tracks last 10 generated portfolios per IP (30-day retention)
- **☁️ Flexible Storage**: Abstracted storage layer supports Vercel Blob, Local, or Cloudflare R2
- **🎯 Monochromatic UI**: Clean, professional black/white/gray interface
- **📱 Responsive**: Works beautifully on all devices

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ (20+ recommended for Vercel Blob)
- npm or yarn
- Accounts for:
  - [Cerebras AI](https://cerebras.ai) (or [Google Gemini](https://ai.google.dev))
  - [Upstash Redis](https://upstash.com)
  - [Google reCAPTCHA v2](https://www.google.com/recaptcha)
  - [Vercel](https://vercel.com) (for deployment)

### Installation

```bash
# Clone the repository
git clone <your-repo-url>
cd folioflexxing

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env.local

# Add your API keys (see below)
```

### Environment Variables

Create a `.env.local` file:

```env
# AI Provider Configuration
AI_PROVIDER=cerebras                    # or "gemini"
CEREBRAS_API_KEY=your_cerebras_api_key
CEREBRAS_MODEL_ID=llama3.3-70b         # optional, defaults to llama3.3-70b
GEMINI_API_KEY=your_gemini_api_key     # optional, only if using Gemini

# Storage Configuration
STORAGE_PROVIDER=local                  # "local" for dev, "vercel-blob" for production
BLOB_READ_WRITE_TOKEN=your_token       # only needed for Vercel Blob

# Upstash Redis (Rate Limiting & History)
UPSTASH_REDIS_REST_URL=your_redis_url
UPSTASH_REDIS_REST_TOKEN=your_redis_token

# Google reCAPTCHA
RECAPTCHA_SECRET_KEY=your_secret_key
NEXT_PUBLIC_RECAPTCHA_SITE_KEY=your_site_key
```

### Development

```bash
# Run development server
npm run dev

# Open browser
open http://localhost:3000
```

## 🏗️ Architecture

### AI Provider System

The app uses a provider pattern for AI services:

```
src/lib/ai/
├── types.ts                 # AIProvider interface
├── cerebras-provider.ts     # Cerebras implementation (streaming)
├── gemini-provider.ts       # Google Gemini implementation
├── provider-factory.ts      # Factory for switching providers
└── index.ts                 # Public exports
```

**Switch providers** by changing `AI_PROVIDER` environment variable.

### Storage System

Abstracted storage layer for portfolio files:

```
src/lib/storage/
├── types.ts                    # StorageProvider interface
├── vercel-blob-provider.ts     # Vercel Blob (production)
├── local-provider.ts           # Local filesystem (development)
├── storage-factory.ts          # Factory for switching providers
└── index.ts                    # Public exports
```

**Switch storage** by changing `STORAGE_PROVIDER` environment variable.

### Portfolio Structure

Each generated portfolio:

```
portfolios/{uuid}/
├── index.html              # Generated portfolio HTML
├── assets/
│   └── profile.{ext}      # Optional profile image
└── metadata.json          # Tracking metadata
```

**Metadata includes:**
- Portfolio ID, creation timestamp
- Template used, AI provider
- Storage provider, IP address
- Asset list, version info

## 📋 Templates

### 1. Elegant Serif
Sophisticated two-column layout with refined typography and muted color palette.

### 2. Bold Typography
Statement fonts with asymmetric layouts and high contrast.

### 3. Minimal Cards
Clean grid-based design with project cards and generous whitespace.

### 4. Dark Modern
Contemporary dark theme with gradient accents and glassmorphism.

### 5. Venice Inspired
Artistic layout with decorative elements and creative flair.

### 6. Bento Grid
Monochromatic single-page layout with bold typography (strictly black/white/gray).

## 🔒 Security Features

### Resume Validation
Multi-layer validation prevents abuse:

1. **Pre-validation Checks**:
   - Minimum 100 characters
   - Maximum 10 pages
   - Maximum 15,000 characters

2. **AI Classification**:
   - Validates document is actually a resume
   - Rejects papers, books, manuals, etc.

3. **Rate Limiting**:
   - 5 requests per minute per IP
   - Powered by Upstash Redis

4. **reCAPTCHA v2**:
   - Prevents bot abuse
   - Resets after each generation

## 🚀 Deployment

### Deploy to Vercel (Recommended)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Add environment variables in Vercel Dashboard:
# - AI_PROVIDER=cerebras
# - CEREBRAS_API_KEY=xxx
# - STORAGE_PROVIDER=vercel-blob
# - BLOB_READ_WRITE_TOKEN=xxx (auto-created)
# - UPSTASH_REDIS_REST_URL=xxx
# - UPSTASH_REDIS_REST_TOKEN=xxx
# - RECAPTCHA_SECRET_KEY=xxx
# - NEXT_PUBLIC_RECAPTCHA_SITE_KEY=xxx
```

**Vercel automatically:**
- Creates Blob storage
- Configures HTTPS/SSL
- Sets up CI/CD from GitHub
- Provides free subdomain

### Alternative Deployments

- **Netlify**: Good Next.js support, requires some config
- **Cloudflare Pages**: Unlimited bandwidth, less Next.js integration
- **Railway/Render**: Persistent filesystem (if not using Blob storage)

## 🛠️ API Routes

### POST `/api/generate`
Generate a portfolio from a PDF resume.

**Body (multipart/form-data):**
- `file`: PDF file (required)
- `template`: Template ID (required)
- `image`: Profile image (optional)
- `recaptchaToken`: reCAPTCHA token (required)

**Response:**
```json
{
  "url": "https://blob.vercel-storage.com/portfolios/xxx/index.html"
}
```

### GET `/api/history`
Retrieve portfolio history for current IP.

**Response:**
```json
{
  "history": [
    {
      "id": "uuid",
      "url": "https://...",
      "template": "elegant-serif",
      "createdAt": "2025-01-10T...",
      "fileName": "resume.pdf",
      "hasImage": true
    }
  ]
}
```

## 📊 Storage Limits

### Vercel Blob (Free Tier)
- **Storage**: 500MB
- **Bandwidth**: Generous (CDN-backed)
- **Estimated**: ~10,000 portfolios

### Cloudflare R2 (Future)
- **Storage**: 10GB free
- **Bandwidth**: Zero egress fees
- **Estimated**: ~200,000 portfolios

## 🧹 Data Retention

- **Portfolio History**: 30 days (Redis)
- **Portfolio Files**: Permanent (until manually cleaned)
- **Rate Limit Data**: 1 minute window

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 Development Notes

### Adding New AI Providers

1. Create provider class implementing `AIProvider` interface
2. Add to `provider-factory.ts` switch statement
3. Add environment variable configuration
4. Update README

### Adding New Storage Providers

1. Create provider class implementing `StorageProvider` interface
2. Add to `storage-factory.ts` switch statement
3. Add environment variable configuration
4. Update README

### Adding New Templates

1. Add template definition to `src/app/page.tsx` templates array
2. Add template-specific prompt instructions in `src/app/api/generate/route.ts`
3. Update README

## 🐛 Troubleshooting

### "Could not extract text from PDF"
- PDF may be scanned/image-based (no selectable text)
- Try exporting as a new PDF with text layer

### "Not a resume" validation error
- Ensure PDF contains resume elements (work history, education, skills)
- Avoid generic documents or poorly formatted resumes

### "Too many requests"
- Rate limit exceeded (5 per minute)
- Wait 60 seconds and try again

### Storage provider errors
- Check `STORAGE_PROVIDER` environment variable
- Verify `BLOB_READ_WRITE_TOKEN` for Vercel Blob
- Check Vercel dashboard for Blob storage status

## 📄 License

MIT License - feel free to use this project for personal or commercial purposes.

## 🙏 Acknowledgments

- Built with [Next.js 14](https://nextjs.org)
- AI powered by [Cerebras](https://cerebras.ai) and [Google Gemini](https://ai.google.dev)
- Storage by [Vercel Blob](https://vercel.com/storage/blob)
- Rate limiting by [Upstash Redis](https://upstash.com)
- Styled with [Tailwind CSS](https://tailwindcss.com)

---

**Made with ❤️ by the FolioFlexxing team**
