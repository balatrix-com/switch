import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import type { Observable } from 'rxjs';
import { finalize, tap } from 'rxjs/operators';

type HeaderValue = string | string[] | undefined;

function firstHeaderValue(value: HeaderValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function errorStatus(error: unknown, fallback: number): number {
  return error instanceof HttpException ? error.getStatus() : fallback >= 400 ? fallback : 500;
}

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const startedAt = process.hrtime.bigint();
    const requestId = firstHeaderValue(request.headers['x-request-id']) || randomUUID();
    const customerId = firstHeaderValue(request.headers['x-customer-id']) || '-';
    const method = request.method.toUpperCase();
    const path = request.originalUrl || request.url;
    const ip = request.ip || request.socket.remoteAddress || '-';
    let thrownError: unknown;

    response.setHeader('X-Request-ID', requestId);
    this.logger.log(
      `--> [${requestId}] ${method} ${path} customer_id=${customerId} ip=${ip}`,
    );

    return next.handle().pipe(
      tap({
        error: (error: unknown) => {
          thrownError = error;
        },
      }),
      finalize(() => {
        const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
        const status = thrownError
          ? errorStatus(thrownError, response.statusCode)
          : response.statusCode;
        const message = `<-- [${requestId}] ${method} ${path} ${status} ${durationMs.toFixed(1)}ms customer_id=${customerId}`;

        if (status >= 500) {
          this.logger.error(message);
        } else if (status >= 400) {
          this.logger.warn(message);
        } else {
          this.logger.log(message);
        }
      }),
    );
  }
}
