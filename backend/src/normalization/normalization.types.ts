export enum NormalizationOperation {
  TRIM = 'TRIM',
  DIGITS_ONLY = 'DIGITS_ONLY',
  STRIP_PLUS = 'STRIP_PLUS',
  ENSURE_PLUS = 'ENSURE_PLUS',
  STRIP_PREFIX = 'STRIP_PREFIX',
  ADD_PREFIX = 'ADD_PREFIX',
  STRIP_LEADING_ONE = 'STRIP_LEADING_ONE',
  ENSURE_LEADING_ONE = 'ENSURE_LEADING_ONE',
  REGEX_REPLACE = 'REGEX_REPLACE',
}

export interface NormalizationStep {
  operation: NormalizationOperation;
  value?: string;
  pattern?: string;
  replacement?: string;
}

export interface NormalizationResult {
  raw: string;
  normalized: string;
  trace: Array<{
    operation: NormalizationOperation;
    before: string;
    after: string;
  }>;
}
