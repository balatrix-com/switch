import { ConfigService } from '@nestjs/config';
import { ZeptoMailService } from '../src/email/zeptomail.service';

describe('ZeptoMailService', () => {
  const credentials = {
    email: 'owner@example.com',
    password: 'TemporarySecret123',
    name: '<Owner>',
    role: 'CUSTOMER' as const,
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('skips delivery when ZeptoMail is disabled', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    const service = new ZeptoMailService(
      new ConfigService({ ZEPTOMAIL_ENABLED: 'false' }),
    );

    await expect(service.sendUserCredentials(credentials)).resolves.toEqual({
      status: 'SKIPPED',
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('sends credentials with the ZeptoMail API and escapes HTML values', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }));
    const service = new ZeptoMailService(
      new ConfigService({
        ZEPTOMAIL_ENABLED: 'true',
        ZEPTOMAIL_SEND_MAIL_TOKEN: 'test-token',
        ZEPTOMAIL_FROM_ADDRESS: 'no-reply@example.com',
        ZEPTOMAIL_FROM_NAME: 'Switchboard',
        PORTAL_LOGIN_URL: 'https://portal.example.com/login',
      }),
    );

    await expect(service.sendUserCredentials(credentials)).resolves.toEqual({
      status: 'SENT',
    });
    const [url, request] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://api.zeptomail.com/v1.1/email');
    expect(request?.headers).toMatchObject({
      Authorization: 'Zoho-enczapikey test-token',
    });
    const requestBody = request?.body;
    expect(typeof requestBody).toBe('string');
    if (typeof requestBody !== 'string')
      throw new Error('Expected a JSON string request body');
    const body = JSON.parse(requestBody) as {
      htmlbody: string;
      textbody: string;
      to: Array<{ email_address: { address: string } }>;
    };
    expect(body.to[0].email_address.address).toBe('owner@example.com');
    expect(body.textbody).toContain('TemporarySecret123');
    expect(body.htmlbody).toContain('&lt;Owner&gt;');
    expect(body.htmlbody).not.toContain('<Owner>');
  });

  it('returns FAILED instead of throwing when ZeptoMail rejects the request', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('invalid token', { status: 401 }));
    const service = new ZeptoMailService(
      new ConfigService({
        ZEPTOMAIL_ENABLED: 'true',
        ZEPTOMAIL_SEND_MAIL_TOKEN: 'bad-token',
        ZEPTOMAIL_FROM_ADDRESS: 'no-reply@example.com',
      }),
    );

    await expect(service.sendUserCredentials(credentials)).resolves.toEqual({
      status: 'FAILED',
    });
  });
});
