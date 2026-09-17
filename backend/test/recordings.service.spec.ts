import { PassThrough } from 'node:stream';
import { RecordingsService } from '../src/recordings/recordings.service';

describe('RecordingsService', () => {
  const config = {
    get: jest.fn((key: string, fallback?: string) => {
      if (key === 'RECORDING_ACCESS_TOKEN') return 'change-me';
      if (key === 'XML_CURL_CACHE_TOKEN') return 'configured-cache-token';
      if (key === 'RECORDING_SERVICE_URL') return 'http://127.0.0.1:8000';
      return fallback;
    }),
  };

  const prisma = {
    $queryRaw: jest.fn().mockResolvedValue([{ customerId: 'cust-123' }]),
  };

  it('falls back to XML_CURL_CACHE_TOKEN when RECORDING_ACCESS_TOKEN is change-me and streams', async () => {
    const service = new RecordingsService(prisma as any, config as any);

    const mockResponse: any = Object.assign(new PassThrough(), {
      status: jest.fn().mockReturnThis(),
      setHeader: jest.fn().mockReturnThis(),
    });

    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({
        'content-type': 'audio/mpeg',
        'content-length': '12345',
      }),
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2, 3]));
          controller.close();
        },
      }),
    } as any);

    await service.stream(
      '03a29acd-a3c3-4bce-b705-9dfe0c58db96',
      mockResponse,
      'cust-123',
      'bytes=0-100',
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:8000/recordings/cust-123/03a29acd-a3c3-4bce-b705-9dfe0c58db96.mp3',
      {
        headers: {
          'X-Recording-Token': 'configured-cache-token',
          Range: 'bytes=0-100',
        },
      },
    );
    expect(mockResponse.status).toHaveBeenCalledWith(200);
    expect(mockResponse.setHeader).toHaveBeenCalledWith(
      'Accept-Ranges',
      'bytes',
    );
    expect(mockResponse.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'audio/mpeg',
    );
    expect(mockResponse.setHeader).toHaveBeenCalledWith(
      'Content-Length',
      '12345',
    );

    fetchMock.mockRestore();
  });
});
