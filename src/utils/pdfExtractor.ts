import * as pdfjsLib from 'pdfjs-dist';

// Set the worker source with a fallback mechanism
const PDF_JS_VERSION = '4.10.38';
const workerSources = [
  `https://unpkg.com/pdfjs-dist@${PDF_JS_VERSION}/build/pdf.worker.min.mjs`,
  `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDF_JS_VERSION}/build/pdf.worker.min.mjs`,
  `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDF_JS_VERSION}/pdf.worker.min.mjs`
];

// Try to set the worker source
pdfjsLib.GlobalWorkerOptions.workerSrc = workerSources[0];

/**
 * Extract text from a PDF file (as base64 or ArrayBuffer)
 * @param pdfData - Base64 string or ArrayBuffer of the PDF
 * @returns Extracted text from the PDF
 */
export async function extractTextFromPDF(pdfData: string | ArrayBuffer): Promise<string> {
  try {
    let pdf;
    
    // Handle base64 string
    if (typeof pdfData === 'string') {
      const base64Content = pdfData.includes(',') ? pdfData.split(',')[1] : pdfData;
      const binaryString = atob(base64Content);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
    } else {
      // Handle ArrayBuffer directly
      pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;
    }

    let extractedText = '';
    const pageCount = pdf.numPages;

    // Extract text from each page
    for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(' ');
      extractedText += pageText + '\n';
    }

    return extractedText.trim();
  } catch (error) {
    console.error('Error extracting text from PDF:', error);
    throw new Error(`Failed to extract text from PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
