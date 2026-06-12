/**
 * Custom error class for PDF parsing failures
 * @extends Error
 */
export class PDFParseError extends Error {
    constructor(message, originalError = null) {
        super(message);
        this.name = 'PDFParseError';
        this.originalError = originalError;
        Error.captureStackTrace(this, PDFParseError);
    }
}