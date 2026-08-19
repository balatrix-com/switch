import { BadRequestException, Injectable } from '@nestjs/common';
import {
  NormalizationOperation,
  NormalizationResult,
  NormalizationStep,
} from './normalization.types';

@Injectable()
export class NormalizationEngineService {
  apply(raw: string, steps: NormalizationStep[] = []): NormalizationResult {
    let current = raw;
    const trace: NormalizationResult['trace'] = [];

    for (const step of steps) {
      const before = current;
      current = this.applyStep(current, step);
      trace.push({ operation: step.operation, before, after: current });
    }

    return { raw, normalized: current, trace };
  }

  parseSteps(value: unknown): NormalizationStep[] {
    if (!Array.isArray(value)) {
      throw new BadRequestException(
        'Normalization profile steps must be an array',
      );
    }
    return value as NormalizationStep[];
  }

  private applyStep(input: string, step: NormalizationStep): string {
    switch (step.operation) {
      case NormalizationOperation.TRIM:
        return input.trim();
      case NormalizationOperation.DIGITS_ONLY:
        return input.replace(/\D/g, '');
      case NormalizationOperation.STRIP_PLUS:
        return input.startsWith('+') ? input.slice(1) : input;
      case NormalizationOperation.ENSURE_PLUS:
        return input.startsWith('+') ? input : `+${input}`;
      case NormalizationOperation.STRIP_PREFIX:
        return step.value && input.startsWith(step.value)
          ? input.slice(step.value.length)
          : input;
      case NormalizationOperation.ADD_PREFIX:
        return `${step.value ?? ''}${input}`;
      case NormalizationOperation.STRIP_LEADING_ONE:
        return input.length === 11 && input.startsWith('1')
          ? input.slice(1)
          : input;
      case NormalizationOperation.ENSURE_LEADING_ONE:
        return input.startsWith('1') ? input : `1${input}`;
      case NormalizationOperation.REGEX_REPLACE:
        if (!step.pattern) {
          throw new BadRequestException('REGEX_REPLACE requires a pattern');
        }
        try {
          return input.replace(
            new RegExp(step.pattern),
            step.replacement ?? '',
          );
        } catch {
          throw new BadRequestException(
            'Normalization profile contains an invalid regex',
          );
        }
      default:
        throw new BadRequestException(
          `Unsupported normalization operation: ${String(step.operation)}`,
        );
    }
  }
}
