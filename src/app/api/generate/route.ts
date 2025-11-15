import { NextRequest, NextResponse } from "next/server";
import PDFParser from "pdf2json";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { AIProviderFactory } from "@/lib/ai";
import { StorageFactory } from "@/lib/storage";

// Ensure environment variables are set
if (!process.env.RECAPTCHA_SECRET_KEY) throw new Error("RECAPTCHA_SECRET_KEY environment variable is not set.");

// Create a new ratelimiter, that allows 5 requests per 1 minute
const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(5, "1 m"),
  analytics: true,
  prefix: "@upstash/ratelimit",
});

// Redis client for portfolio history
const redis = Redis.fromEnv();

// Helper function to clean up AI response
const cleanJSON = (text: string) => {
  const match = text.match(/```json\n([\s\S]*?)\n```/);
  return match ? match[1] : text;
};

// Helper function to clean up AI response for HTML
const cleanHTML = (text: string) => {
    const match = text.match(/```html\n([\s\S]*?)\n```/);
    return match ? match[1] : text;
  };

const parsePdfBuffer = (fileBuffer: Buffer): Promise<{ text: string; pageCount: number }> => {
    return new Promise((resolve, reject) => {
        const pdfParser = new PDFParser();
        pdfParser.on("pdfParser_dataError", (errData: any) => reject(new Error(errData.parserError)));
        pdfParser.on("pdfParser_dataReady", (pdfData: any) => {
            const pageCount = pdfData.Pages.length;
            const rawText = pdfData.Pages.map((page: any) => 
                page.Texts.map((text: any) => decodeURIComponent(text.R[0].T)).join(" ")
            ).join("\n");
            resolve({ text: rawText, pageCount });
        });
        pdfParser.parseBuffer(fileBuffer);
    });
};

export async function POST(req: NextRequest) {
  try {
    // Initialize AI provider
    const aiProvider = AIProviderFactory.getDefaultProvider();
    console.log(`Using AI provider: ${aiProvider.getName()}`);

    // Initialize storage provider
    const storageProvider = StorageFactory.getDefaultProvider();
    console.log(`Using storage provider: ${storageProvider.getName()}`);

    // Rate limit by IP
    const identifier = req.ip ?? "127.0.0.1";
    const { success: rateLimitSuccess } = await ratelimit.limit(identifier);
    if (!rateLimitSuccess) {
      return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const image = formData.get("image") as File | null;
    const template = formData.get("template") as string || "elegant-serif";
    const recaptchaToken = formData.get("recaptchaToken") as string;

    // Verify reCAPTCHA
    const recaptchaResponse = await fetch("https://www.google.com/recaptcha/api/siteverify", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `secret=${process.env.RECAPTCHA_SECRET_KEY}&response=${recaptchaToken}`,
    });
    const recaptchaData = await recaptchaResponse.json();
    if (!recaptchaData.success) {
        return NextResponse.json({ error: "reCAPTCHA verification failed." }, { status: 400 });
    }

    if (!file) {
      return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
    }

    // 1. Extract text from PDF
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const { text: resumeText, pageCount } = await parsePdfBuffer(fileBuffer);

    if (!resumeText) {
        return NextResponse.json({ error: "Could not extract text from PDF." }, { status: 500 });
    }

    // 1.3. Pre-validation: Check basic resume characteristics
    const textLength = resumeText.trim().length;
    
    // Too short - likely not a resume
    if (textLength < 100) {
        return NextResponse.json({ 
            error: "The PDF content is too short to be a resume. Please upload a complete resume document." 
        }, { status: 400 });
    }
    
    // Too long - likely a book, manual, or research paper
    if (pageCount > 10) {
        return NextResponse.json({ 
            error: "The PDF is too long to be a resume (max 5 pages). Resumes should be concise and focused." 
        }, { status: 400 });
    }
    
    // Extremely long text suggests non-resume content
    if (textLength > 35000) {
        return NextResponse.json({ 
            error: "The PDF contains too much text to be a resume. Please upload a standard 1-5 page resume." 
        }, { status: 400 });
    }

    // 1.5. Validate that the PDF is actually a resume
    const validationPrompt = `
      You are a document classifier. Analyze the following text and determine if it is a resume/CV or not.
      
      A resume/CV typically contains:
      - Personal information (name, contact details)
      - Work experience or employment history
      - Education history
      - Skills or competencies
      - Professional summary or objective
      
      If this document is clearly NOT a resume (e.g., it's a research paper, book, article, manual, legal document, financial report, etc.), respond with exactly:
      NOT_A_RESUME
      
      If this document IS a resume or CV (even if incomplete or poorly formatted), respond with exactly:
      VALID_RESUME
      
      Document text:
      ---
      ${resumeText.slice(0, 2000)}
      ---
      
      Your response (only "NOT_A_RESUME" or "VALID_RESUME"):
    `;

    const validationResult = await aiProvider.generateText(validationPrompt);
    const isValidResume = validationResult.trim().includes("VALID_RESUME");

    if (!isValidResume) {
        return NextResponse.json({ 
            error: "The uploaded PDF doesn't appear to be a resume or CV. Please upload a valid resume document." 
        }, { status: 400 });
    }

    // 1.6. Prepare image info if provided
    let imageBuffer = null;
    let imageExtension = null;
    if (image) {
        imageBuffer = Buffer.from(await image.arrayBuffer());
        imageExtension = image.name.split('.').pop() || 'jpg';
    }

    // 2. AI Magic, Step 1: Structuring the Data
    const structuringPrompt = `
      You are an expert data analyst. Analyze the following resume text and extract the information into a structured JSON object.
      The JSON should have the following keys: "personalInfo", "summary", "workExperience", "education", "skills", "projects".
      - "personalInfo": should contain "name", "email", "phone", "linkedin", "github".
      - "workExperience": should be an array of objects, each with "company", "role", "dates", and "responsibilities" (as an array of strings).
      - "education": should be an array of objects, each with "institution", "degree", and "dates".
      - "skills": should be an array of strings.
      - "projects": should be an array of objects, each with "name", "description", and "technologies" (as an array of strings).
      If a section is not present, return an empty array or object for that key.

      Resume text:
      ---
      ${resumeText}
      ---

      Return only the JSON object, formatted as a JSON markdown code block.
    `;

    const structuredDataText = await aiProvider.generateText(structuringPrompt);
    const structuredData = JSON.parse(cleanJSON(structuredDataText));

    // 3. Upload image first if provided (so we have the URL for HTML generation)
    const uniqueId = crypto.randomUUID();
    const portfolioPrefix = `portfolios/${uniqueId}`;
    let uploadedImageUrl: string | undefined;
    const assets = [];
    
    if (image && imageBuffer && imageExtension) {
        uploadedImageUrl = await storageProvider.uploadFile(
          `${portfolioPrefix}/assets/profile.${imageExtension}`,
          imageBuffer,
          image.type
        );
        assets.push(`profile.${imageExtension}`);
    }

    // 4. AI Magic, Step 2: Generating the Website
    // Add randomness to avoid caching and encourage creative variations
    const randomSeed = Math.random().toString(36).substring(7);
    const creativeVariations = [
      "Experiment with unique color combinations and unexpected typography choices.",
      "Try an unconventional layout approach that breaks traditional design patterns.",
      "Focus on creating a memorable visual identity through distinctive design elements.",
      "Push creative boundaries with bold design decisions and artistic flair.",
      "Create a unique interpretation that stands out from typical portfolio websites."
    ];
    const randomVariation = creativeVariations[Math.floor(Math.random() * creativeVariations.length)];
    
    const generationPrompt = `
      You are an award-winning web designer specializing in sophisticated, high-end personal portfolios.
      Your task is to transform the provided JSON data into a complete, single-page HTML file that looks like a professional designer's portfolio website.

      **CRITICAL: AVOID GENERIC AI DESIGN**
      - DO NOT create generic, soulless designs that look like "AI slop"
      - AVOID: Generic sans-serif fonts (Inter, Roboto, System UI), flat solid backgrounds, boring layouts
      - AVOID: Overly safe, corporate aesthetics with no personality
      - CREATE: Distinctive, memorable designs with strong visual identity and creative risk-taking
      - Your design should look hand-crafted by a professional designer, NOT generated by AI

      **Design Philosophy:**
      - Create a portfolio that looks like it was designed by a professional UI/UX designer
      - Think portfolio website, not resume - focus on visual impact and storytelling
      - Use large, bold typography with distinctive font choices
      - Layer backgrounds with gradients, patterns, and textures for depth
      - Incorporate decorative elements (subtle illustrations, abstract shapes, geometric patterns)
      - Make it feel personal and unique, not template-like
      - IMPORTANT: ${randomVariation}
      - Design seed: ${randomSeed} (use this to inspire unique creative choices)

      **Technical Requirements:**
      - **Styling:** Use the Tailwind CSS CDN: <script src="https://cdn.tailwindcss.com"></script>
      - **Fonts:** CRITICAL - Choose distinctive, characterful fonts. Avoid generic options.
        * Use Google Fonts with personality and visual interest
        * Pair contrasting fonts (serif + sans-serif, display + body)
        * Examples: Playfair Display, Crimson Pro, Space Grotesk, DM Serif Display, Archivo Black, Syne
      - **Backgrounds:** Create depth with layered elements:
        * Use CSS gradients (linear, radial, conic)
        * Add geometric patterns or organic shapes
        * Layer semi-transparent elements for depth
        * Incorporate subtle textures or noise
      - **Animations:** Add meaningful micro-interactions:
        * Smooth scroll-triggered animations (fade in, slide up)
        * Hover effects on cards and buttons (scale, shadow changes)
        * Stagger animations for lists and grids
        * Use CSS transitions and transforms
      - **Icons:** Use inline SVGs for social links and decorative elements
      - **Responsive:** Must work beautifully on mobile, tablet, and desktop

      **Template: "${template}"**

      Template-Specific Design Guidelines:

      **elegant-serif:**
      - **Fonts:** Playfair Display (headings) + Crimson Pro (body) OR Lora (headings) + Source Serif Pro (body)
      - **Background:** Cream base (#FAF7F2) with subtle paper texture via CSS noise filter
        * Add faint radial gradient from center (white to cream)
        * Incorporate thin decorative lines or borders in muted gold
      - **Animations:** 
        * Fade-in sections on scroll with slight upward motion
        * Smooth parallax on decorative elements
        * Elegant hover transitions on project cards (subtle shadow growth)
      - **Layout:** Refined two-column layout with sidebar navigation
      - **Color Palette:** Beiges, warm grays, deep burgundy or forest green accent
      - **Details:** Timeline-style work experience, decorative flourishes, serif drop caps
      - **Inspiration:** High-end editorial design, luxury brand websites

      **neo-brutalism:**
      - **Fonts:** Archivo Black (display) + Space Grotesk (body) OR Syne (headings) + IBM Plex Mono (details)
      - **Background:** Warm cream (#FFFAE5) with optional subtle grain texture
        * Add bold geometric shapes as decorative elements
        * Use solid color blocks (orange, green, purple) as section dividers
      - **Animations:**
        * Elements "pop in" with bounce effect on scroll
        * Hover: Remove shadow and translate element to shadow position (active press effect)
        * Stagger animations for grid items
        * Rotate/skew animations on decorative shapes
      - **Visual Style:**
        * Heavy 4px black borders on ALL interactive elements
        * Hard drop shadows (8px 8px 0px black) - NO blur
        * Accent colors: bright orange (#FF4D00), acid green (#A3FF00), electric purple (#9D00FF)
        * NO rounded corners - pure geometric rectangles
        * Text-stroke effects for outlined typography (-webkit-text-stroke)
      - **Layout:** Asymmetric bento-grid with varying card sizes
      - **Inspiration:** Y2K web design, punk zines, screen printing, brutalist architecture

      **minimal-cards:**
      - **Fonts:** DM Sans (headings, bold weight) + Inter (body) OR Manrope (headings) + Work Sans (body)
      - **Background:** Pure white or very light gray (#FAFAFA) with subtle gradient overlay
        * Add faint geometric grid pattern in background
        * Use colored accent blocks sparingly for visual interest
      - **Animations:**
        * Cards lift on hover with smooth shadow expansion
        * Fade-in and slide-up on scroll with stagger effect
        * Smooth color transitions on interactive elements
        * Scale transform on card hover (1.02x growth)
      - **Visual Style:**
        * Soft shadows (0 4px 20px rgba(0,0,0,0.08))
        * Single vibrant accent color (blue, purple, or teal)
        * Rounded corners (8-12px) for modern feel
        * Generous whitespace and padding
      - **Layout:** Clean grid (2-3 columns) with consistent card sizing
      - **Inspiration:** Dribbble, Behance, modern SaaS landing pages

      **dark-modern:**
      - **Fonts:** Inter (headings, extra-bold) + JetBrains Mono (code/details) OR Outfit (display) + Space Grotesk (body)
      - **Background:** Deep dark (#0a0a0a to #1a1a1a) with layered gradients
        * Add radial gradient spotlights (purple, blue, cyan)
        * Incorporate subtle dot or line patterns
        * Use mesh gradients for depth (dark blue to purple to teal)
      - **Animations:**
        * Smooth fade-ins with glow effects on scroll
        * Pulsing glow on accent elements
        * Smooth glassmorphic card reveals
        * Hover: Increase glow intensity and slight lift
      - **Visual Style:**
        * Glassmorphism (backdrop-filter: blur, semi-transparent backgrounds)
        * Neon accent colors (electric blue, cyan, magenta, lime green)
        * Soft glow effects (box-shadow with spread)
        * High contrast white/light text (#E5E5E5)
      - **Layout:** Full-bleed sections with overlapping glassmorphic cards
      - **Inspiration:** Apple product pages, crypto/web3 sites, cyberpunk aesthetic

      **fluid-gradient:**
      - **Fonts:** Plus Jakarta Sans (headings) + DM Sans (body) OR Satoshi (display) + Inter (body)
      - **Background:** Multi-color mesh gradient with smooth color transitions
        * Layer 3-4 colors: blues (#4F46E5), purples (#9333EA), oranges (#F59E0B), pinks (#EC4899)
        * Use radial and linear gradients combined
        * Add subtle animated gradient shift (optional CSS animation)
      - **Animations:**
        * Glassmorphic cards fade in with slight scale
        * Smooth parallax on background gradient
        * Hover: Brighten glassmorphic effect and lift card
        * Floating animation on decorative elements
      - **Visual Style:**
        * Frosted glass cards (backdrop-filter: blur(20px), rgba backgrounds)
        * Soft borders (1px rgba(255,255,255,0.2))
        * Premium shadows with multiple layers
        * White or very light text on glass
      - **Layout:** Centered content with glassmorphic card sections
      - **Inspiration:** Stripe, Linear, modern fintech/SaaS landing pages

      **bento-grid:**
      - **Fonts:** Sohne (display, if available via @font-face) OR Inter (headings, black weight) + SF Pro Text fallback
      - **Background:** Pure white (#FFFFFF) or very light gray (#F9F9F9)
        * NO gradients or textures - pure flat color
        * Use subtle grid lines or dividers in light gray (#E5E5E5)
      - **Animations:**
        * Minimal fade-in on scroll (opacity only, no motion)
        * Subtle hover state on buttons (slight background color shift)
        * NO complex animations - prioritize stillness
      - **Visual Style:**
        * STRICTLY MONOCHROMATIC (blacks, whites, grays only)
        * Very large headings (clamp(48px, 8vw, 120px))
        * Ultra-light borders (1px #E5E5E5)
        * Minimal shadows (if any): 0 1px 3px rgba(0,0,0,0.05)
        * Pills buttons with black fill and white text
      - **Layout:** Single-column, centered content with generous whitespace
        * Each section separated by 120px+ vertical space
        * Maximum width: 800px for readability
      - **Inspiration:** Linear, Vercel, minimalist Swiss design, brutalist simplicity

      **Content Structure:**
      - Hero section: Large name, title/role, brief tagline
      - About section: 2-3 paragraph introduction with personality
      - Experience section: Focus on impact and achievements, not just responsibilities
      - Projects section: Visual cards with descriptions
      - Skills section: Organized by category or displayed visually
      - Contact section: Social links with icons

      **Pro Tips:**
      - Include subtle background patterns or gradients
      - Use accent colors strategically to draw attention
      - Add metrics/numbers where possible (years of experience, projects completed)
      - Make links and buttons visually distinct with hover states

      ${uploadedImageUrl ? `**Profile Image:**
      A profile image has been provided. Use this image in the hero section or header area.
      Embed it using: <img src="${uploadedImageUrl}" alt="Profile" class="..." />
      Make it prominent - use a large circular or artistic crop as appropriate for the template style.` : `**Profile Image:**
      NO profile image was provided. DO NOT include any image placeholders, broken image tags, or image frames.
      Focus on typography and decorative elements instead. Use the person's initials in a circular badge if needed.`}

      JSON data:
      ---
      ${JSON.stringify(structuredData, null, 2)}
      ---

      Return only the complete HTML file, formatted as an HTML markdown code block. Do not include any other text or explanation.
      Make it look professional, polished, and impressive - like something that would get featured on Awwwards or CSS Design Awards.
    `;

    const generatedHtml = cleanHTML(await aiProvider.generateText(generationPrompt));

    // 5. Save the HTML file
    const htmlUrl = await storageProvider.uploadFile(
      `${portfolioPrefix}/index.html`,
      generatedHtml,
      "text/html"
    );

    // 6. Create and save metadata.json
    const metadata = {
        id: uniqueId,
        createdAt: new Date().toISOString(),
        template: template,
        version: "1.0.0",
        ip: identifier,
        assets: assets,
        hasImage: !!image,
        fileName: file.name,
        storageProvider: storageProvider.getName()
    };
    await storageProvider.uploadJSON(`${portfolioPrefix}/metadata.json`, metadata);

    // 7. Store portfolio in Redis history for this IP
    const historyKey = `portfolio:history:${identifier}`;
    const portfolioRecord = {
      id: uniqueId,
      url: htmlUrl,
      template: template,
      createdAt: new Date().toISOString(),
      fileName: file.name,
      hasImage: !!image
    };
    
    // Get existing history (up to 10 most recent)
    const existingHistory = await redis.get<any[]>(historyKey) || [];
    const updatedHistory = [portfolioRecord, ...existingHistory].slice(0, 10);
    
    // Store with 30 day expiration
    await redis.set(historyKey, updatedHistory, { ex: 30 * 24 * 60 * 60 });

    // 8. Return the URL
    return NextResponse.json({ url: htmlUrl });

  } catch (error: any) {
    console.error("Error in /api/generate:", error);
    return NextResponse.json({ error: error.message || "An internal server error occurred." }, { status: 500 });
  }
}