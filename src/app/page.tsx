"use client";

import { useState, useEffect } from "react";
import ReCAPTCHA from "react-google-recaptcha";

const templates = [
  { id: "elegant-serif", name: "Elegant Serif", description: "Sophisticated two-column layout with refined typography" },
  { id: "bold-typography", name: "Bold Typography", description: "Statement fonts with asymmetric layouts" },
  { id: "minimal-cards", name: "Minimal Cards", description: "Clean grid-based design with project cards" },
  { id: "dark-modern", name: "Dark Modern", description: "Contemporary dark theme with accent colors" },
  { id: "venice-inspired", name: "Venice Inspired", description: "Artistic layout with decorative elements" },
  { id: "bento-grid", name: "Bento Grid", description: "Modular card layout with monochromatic palette and 3D depth" },
];

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const isAbsoluteUrl = process.env.NEXT_PUBLIC_STORAGE_PROVIDER === 'vercel-blob';
  const [error, setError] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState(templates[0].id);
  const [recaptchaToken, setRecaptchaToken] = useState<string | null>(null);
  const [recaptchaVerified, setRecaptchaVerified] = useState(false);
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFile(e.target.files[0]);
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const imageFile = e.target.files[0];
      setImage(imageFile);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(imageFile);
    }
  };

  const handleRecaptchaChange = (token: string | null) => {
    setRecaptchaToken(token);
    if (token) {
      setRecaptchaVerified(true);
    }
  };

  const fetchHistory = async () => {
    try {
      const response = await fetch("/api/history");
      const data = await response.json();
      setHistory(data.history || []);
    } catch (err) {
      console.error("Failed to fetch history:", err);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const handleCopyUrl = () => {
    if (resultUrl) {
      const fullUrl = isAbsoluteUrl ? resultUrl : `${window.location.origin}${resultUrl}`;
      navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownloadHtml = async () => {
    if (resultUrl) {
      const response = await fetch(resultUrl);
      const html = await response.text();
      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'portfolio.html';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!file) {
      setError("Please select a PDF file to upload.");
      return;
    }
    if (!recaptchaToken) {
      setError("Please complete the reCAPTCHA.");
      return;
    }

    setLoading(true);
    setError(null);
    setResultUrl(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("template", selectedTemplate);
    formData.append("recaptchaToken", recaptchaToken);
    if (image) {
      formData.append("image", image);
    }

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "An unknown error occurred.");
      }

      const data = await response.json();
      setResultUrl(data.url);
      await fetchHistory();
      
      // Reset form for next generation
      setRecaptchaVerified(false);
      setRecaptchaToken(null);
    } catch (err: any) {
      setError(err.message);
      // Reset reCAPTCHA on error so user can try again
      setRecaptchaVerified(false);
      setRecaptchaToken(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="relative min-h-screen w-full flex bg-gray-900 overflow-hidden">
      {/* Left Panel: Controls */}
      <div className={`w-full md:w-1/2 flex-shrink-0 flex flex-col items-center justify-center p-8 transition-all duration-500 ${resultUrl ? 'md:w-1/2' : 'md:w-full'}`}>
        <div className="w-full max-w-lg">
          <div className="text-center mb-10">
            <h1 className="text-5xl font-bold text-white mb-4">
              FolioFlexxing
            </h1>
            <p className="text-lg text-gray-300">
              Transform your resume into a stunning portfolio website
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* File Upload */}
            <div>
              <button
                type="button"
                onClick={() => !file && document.getElementById('file-upload')?.click()}
                className="w-full flex items-center justify-between text-left text-sm font-medium text-gray-300 mb-2 hover:text-gray-100 transition-colors"
              >
                <span>1. Upload PDF Resume {file && '✓'}</span>
                {file && (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
              {!file && (
              <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-600 border-dashed rounded-lg bg-gray-800/50 hover:border-indigo-500 transition-colors">
                <div className="space-y-1 text-center">
                  <svg className="mx-auto h-12 w-12 text-gray-500" stroke="currentColor" fill="none" viewBox="0 0 48 48" aria-hidden="true">
                    <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <div className="flex text-sm text-gray-400">
                    <label htmlFor="file-upload" className="relative cursor-pointer rounded-md font-medium text-gray-200 hover:text-white focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-gray-500">
                      <span>Upload a file</span>
                      <input id="file-upload" name="file-upload" type="file" className="sr-only" onChange={handleFileChange} accept=".pdf" />
                    </label>
                    <p className="pl-1">or drag and drop</p>
                  </div>
                  <p className="text-xs text-gray-500">
                    PDF up to 10MB
                  </p>
                </div>
              </div>
              )}
              {file && (
                <div className="px-4 py-2 bg-gray-800/30 border border-gray-700 rounded-lg">
                  <p className="text-sm text-gray-300">{file.name}</p>
                  <button
                    type="button"
                    onClick={() => setFile(null)}
                    className="text-xs text-red-400 hover:text-red-300 mt-1"
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>

            {/* Image Upload (Optional) */}
            {file && (
            <div>
              <label htmlFor="image-upload" className="block text-sm font-medium text-gray-300 mb-2">
                2. Profile Image (Optional)
              </label>
              <div className="mt-1 flex items-center gap-4">
                {imagePreview ? (
                  <div className="relative">
                    <img src={imagePreview} alt="Preview" className="w-20 h-20 rounded-full object-cover border-2 border-gray-400" />
                    <button
                      type="button"
                      onClick={() => {
                        setImage(null);
                        setImagePreview(null);
                      }}
                      className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ) : (
                  <div className="w-20 h-20 rounded-full bg-gray-700 flex items-center justify-center">
                    <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                )}
                <label htmlFor="image-upload" className="cursor-pointer bg-gray-700 px-4 py-2 border border-gray-600 rounded-lg text-sm font-medium text-gray-200 hover:bg-gray-600 transition-colors focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-gray-500">
                  <span>{image ? 'Change Image' : 'Upload Image'}</span>
                  <input id="image-upload" name="image-upload" type="file" className="sr-only" onChange={handleImageChange} accept="image/*" />
                </label>
              </div>
              <p className="mt-2 text-xs text-gray-500">JPG, PNG, or GIF up to 5MB</p>
            </div>
            )}

            {/* Template Selection */}
            {file && (
            <div>
              <label htmlFor="template" className="block text-sm font-medium text-gray-300 mb-3">
                3. Choose a Template Style
              </label>
              <div className="grid grid-cols-2 gap-2">
                {templates.map((template) => (
                  <label
                    key={template.id}
                    className={`relative flex flex-col p-3 border-2 rounded-lg cursor-pointer hover:border-gray-400 transition-colors ${
                      selectedTemplate === template.id
                        ? 'border-white bg-gray-800'
                        : 'border-gray-600 bg-gray-800/50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="template"
                      value={template.id}
                      checked={selectedTemplate === template.id}
                      onChange={(e) => setSelectedTemplate(e.target.value)}
                      className="sr-only"
                    />
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-gray-100">{template.name}</span>
                      {selectedTemplate === template.id && (
                        <svg className="h-4 w-4 text-white flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 leading-tight">{template.description}</p>
                  </label>
                ))}
              </div>
            </div>
            )}
            
            {/* reCAPTCHA */}
            {file && (
              <>
                {!recaptchaVerified && (
                  <div className="flex justify-center">
                      <ReCAPTCHA
                          sitekey={process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY!}
                          onChange={handleRecaptchaChange}
                      />
                  </div>
                )}
                
                {recaptchaVerified && (
                  <div className="flex items-center justify-center gap-2 p-3 bg-green-900/30 border border-green-700 rounded-lg">
                    <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-sm text-green-300 font-medium">Verified</span>
                  </div>
                )}
              </>
            )}

            {/* Submit Button */}
            <div>
              <button
                type="submit"
                disabled={loading || !file || !recaptchaToken}
                className="w-full flex justify-center items-center gap-2 py-4 px-6 border border-transparent rounded-lg shadow-lg text-base font-semibold text-black bg-white hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:bg-gray-600 disabled:text-gray-400 disabled:cursor-not-allowed transition-all"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Generating...</span>
                  </>
                ) : (
                  <>
                    <span>Generate Portfolio</span>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </>
                )}
              </button>
            </div>
          </form>

          {error && (
            <div className="p-4 mt-6 text-sm text-red-200 bg-red-900/50 border border-red-800 rounded-lg" role="alert">
              <span className="font-medium">Error:</span> {error}
            </div>
          )}

          {/* Portfolio History */}
          {history.length > 0 && (
            <div className="mt-8">
              <button
                onClick={() => setShowHistory(!showHistory)}
                className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-200 transition-colors"
              >
                <svg className={`w-4 h-4 transition-transform ${showHistory ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                <span>Recent Portfolios ({history.length})</span>
              </button>
              
              {showHistory && (
                <div className="mt-3 space-y-2">
                  {history.map((item) => (
                    <a
                      key={item.id}
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block p-3 bg-gray-800/50 border border-gray-700 rounded-lg hover:border-gray-400 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-200 truncate">{item.fileName}</p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {item.template} • {new Date(item.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                        <svg className="w-4 h-4 text-gray-400 flex-shrink-0 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Right Panel: Preview */}
      <div className={`absolute top-0 right-0 h-full w-1/2 bg-white shadow-2xl transform transition-transform duration-500 ease-in-out ${resultUrl ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="relative w-full h-full flex flex-col">
          {resultUrl && (
            <>
              <iframe 
                src={isAbsoluteUrl ? `/api/proxy-html?url=${encodeURIComponent(resultUrl)}` : resultUrl} 
                className="w-full flex-1 border-none" 
                title="Portfolio Preview" 
              />
              
              {/* Bottom Banner */}
              <div className="bg-gradient-to-r from-gray-900 to-gray-800 border-t border-gray-700 px-6 py-4 flex items-center gap-4">
                {/* URL Display */}
                <div className="flex-1 flex items-center gap-3 bg-gray-800/50 rounded-lg px-4 py-2 min-w-0">
                  <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                  <span className="text-sm text-gray-300 truncate font-mono">
                    {isAbsoluteUrl ? resultUrl : `${window.location.origin}${resultUrl}`}
                  </span>
                </div>

                {/* Copy Button */}
                <button
                  onClick={handleCopyUrl}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  title="Copy URL"
                >
                  {copied ? (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-sm font-medium">Copied!</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      <span className="text-sm font-medium">Copy</span>
                    </>
                  )}
                </button>

                {/* Download Button */}
                <button
                  onClick={handleDownloadHtml}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  title="Download HTML"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  <span className="text-sm font-medium">Download</span>
                </button>

                {/* Open in New Tab */}
                <a
                  href={resultUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <span className="text-sm font-medium">Open</span>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
