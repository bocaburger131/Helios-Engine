import { PDFParserService } from '../services/pdfParserService.js';

export class PDFController {
  constructor(pdfParserService = new PDFParserService()) {
    this.pdfParserService = pdfParserService;
  }

  async parsePDF(req, res, next) {
    try {
      const { buffer } = req.file;
      const result = await this.pdfParserService.parse(buffer);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }
}

export default PDFController;