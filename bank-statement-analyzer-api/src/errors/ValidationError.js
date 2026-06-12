/**
 * Custom error for validation failures
 * @class ValidationError
 * @extends Error
 */
export class ValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ValidationError';
        this.statusCode = 400;
    }
}