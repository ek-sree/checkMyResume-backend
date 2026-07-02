import mammoth from 'mammoth';
import { createRequire } from 'node:module';
import { ApiError } from '../utils/ApiError';


const require = createRequire(import.meta.url);

export type SourceType = 'pdf' | 'docx' | 'text';

export interface ParsedResume {
  rawText: string;
  sourceType: SourceType;
}


export async function parseResumeFile(file: Express.Multer.File): Promise<ParsedResume> {
  let rawText = '';
  let sourceType: SourceType;

  if (file.mimetype === 'application/pdf') {
    sourceType = 'pdf';
    const pdfParse = require('pdf-parse') as (b: Buffer) => Promise<{ text: string }>;
    const parsed = await pdfParse(file.buffer);
    rawText = parsed.text;
  } else if (
    file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    sourceType = 'docx';
    const result = await mammoth.extractRawText({ buffer: file.buffer });
    rawText = result.value;
  } else {
    sourceType = 'text';
    rawText = file.buffer.toString('utf-8');
  }

  rawText = rawText.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

  if (rawText.length < 30) {
    throw ApiError.badRequest(
      'Could not extract meaningful text from this file. Try a different file or paste the text directly.'
    );
  }

  return { rawText, sourceType };
}
