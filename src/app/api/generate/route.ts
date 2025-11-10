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
        const pdfParser = new PDFParser(null, 1);
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
    if (textLength > 15000) {
        return NextResponse.json({ 
            error: "The PDF contains too much text to be a resume. Please upload a standard 1-3 page resume." 
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
    let imagePath = null;
    let imageBuffer = null;
    if (image) {
        imageBuffer = Buffer.from(await image.arrayBuffer());
        const imageExtension = image.name.split('.').pop() || 'jpg';
        imagePath = `./assets/profile.${imageExtension}`;
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

    // 3. AI Magic, Step 2: Generating the Website
    const generationPrompt = `
      You are an award-winning web designer specializing in sophisticated, high-end personal portfolios.
      Your task is to transform the provided JSON data into a complete, single-page HTML file that looks like a professional designer's portfolio website.

      **Design Philosophy:**
      - Create a portfolio that looks like it was designed by a professional UI/UX designer
      - Think portfolio website, not resume - focus on visual impact and storytelling
      - Use large, bold typography and generous white space
      - Incorporate decorative elements (subtle illustrations, abstract shapes, gradient backgrounds)
      - Make it feel personal and unique, not template-like

      **Technical Requirements:**
      - **Styling:** Use the Tailwind CSS CDN: <script src="https://cdn.tailwindcss.com"></script>
      - **Fonts:** Import 2-3 complementary fonts from Google Fonts (mix serif and sans-serif for visual interest)
      - **Icons:** Use inline SVGs for social links and decorative elements
      - **Responsive:** Must work beautifully on mobile, tablet, and desktop
      - **Smooth Animations:** Add subtle scroll animations or hover effects

      **Template: "${template}"**

      Template-Specific Design Guidelines:

      **elegant-serif:**
      - Refined two-column layout with sidebar navigation
      - Use elegant serif fonts (like Playfair Display, Lora) for headings
      - Muted, sophisticated color palette (beiges, grays, with one refined accent)
      - Timeline-style work experience section
      - Add decorative flourishes or borders
      - Reference inspiration: professional designer portfolios with classic typography

      **bold-typography:**
      - Large, statement typography that dominates the page
      - Asymmetric, dynamic layouts with overlapping elements
      - High contrast color scheme
      - Use mix of font weights and sizes to create visual hierarchy
      - Hero section with oversized name and title
      - Reference inspiration: modern portfolio sites with experimental typography

      **minimal-cards:**
      - Clean grid-based layout
      - Project and experience cards with subtle shadows and hover effects
      - Single accent color on neutral background
      - Generous padding and spacing
      - Clear visual hierarchy through size and placement
      - Reference inspiration: Behance/Dribbble portfolio layouts

      **dark-modern:**
      - Dark background (#0a0a0a to #1a1a1a) with bright accent colors
      - Contemporary, tech-forward aesthetic
      - Gradient accents and glowing effects
      - White or light text with excellent readability
      - Glassmorphism or subtle blur effects
      - Reference inspiration: modern tech portfolio sites

      **venice-inspired:**
      - Artistic, expressive layout with decorative elements
      - Incorporate subtle circular badges or decorative icons
      - Mix of italicized and regular fonts
      - Soft, warm color palette
      - Add small illustrative elements (flowers, abstract shapes)
      - Personality-driven design with creative flair
      - Reference inspiration: designer portfolios with artistic touches

      **bento-grid:**
      - STRICTLY MONOCHROMATIC color scheme (grays, whites, blacks only - NO color accents)
      - Single-page scrolling layout with full-width sections
      - Clean, minimalist design with strong emphasis on typography
      - Hero section: Large, bold statement typography that dominates the viewport
      - Use very large font sizes for main headings (60px-120px)
      - Light gray or white background with black text
      - Sections separated by generous whitespace
      - Social links displayed as minimal text/icon buttons at the bottom
      - No complex grids - focus on centered, single-column layout
      - Simple pill-shaped buttons with black fill and white text
      - Subtle shadows and clean borders where needed
      - Professional, portfolio-style layout (not resume-like)
      - Each section should breathe with lots of padding/margin
      - Keep it ultra-minimal - less is more
      - Reference inspiration: modern portfolio sites like the one shown, minimalist design systems

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

      ${imagePath ? `**Profile Image:**
      A profile image has been provided. Use this image in the hero section or header area.
      Embed it using: <img src="${imagePath}" alt="Profile" class="..." />
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

    // 4. Save the portfolio using storage provider
    const uniqueId = crypto.randomUUID();
    const portfolioPrefix = `portfolios/${uniqueId}`;

    // Save the HTML file
    const htmlUrl = await storageProvider.uploadFile(
      `${portfolioPrefix}/index.html`,
      generatedHtml,
      "text/html"
    );

    // Save the image if provided
    const assets = [];
    let uploadedImageUrl: string | undefined;
    if (image && imageBuffer) {
        const imageExtension = image.name.split('.').pop() || 'jpg';
        uploadedImageUrl = await storageProvider.uploadFile(
          `${portfolioPrefix}/assets/profile.${imageExtension}`,
          imageBuffer,
          image.type
        );
        assets.push(`profile.${imageExtension}`);
    }

    // Create and save metadata.json
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

    // 5. Store portfolio in Redis history for this IP
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

    // 6. Return the URL
    return NextResponse.json({ url: htmlUrl });

  } catch (error: any) {
    console.error("Error in /api/generate:", error);
    return NextResponse.json({ error: error.message || "An internal server error occurred." }, { status: 500 });
  }
}