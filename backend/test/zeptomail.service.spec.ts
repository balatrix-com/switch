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

  it('sends credentials with the ZeptoMail template API', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }));
    const service = new ZeptoMailService(
      new ConfigService({
        ZEPTOMAIL_ENABLED: 'true',
        ZEPTOMAIL_SEND_MAIL_TOKEN: 'test-token',
        ZEPTOMAIL_FROM_ADDRESS: 'noreply@balatrix.ca',
        ZEPTOMAIL_FROM_NAME: 'Balatrix',
        ZEPTOMAIL_TEMPLATE_ALIAS: 'login-details',
        PORTAL_LOGIN_URL: 'https://bswitch.balatrix.com',
      }),
    );

    await expect(
      service.sendUserCredentials({ ...credentials, customerId: 'CUST1001' }),
    ).resolves.toEqual({
      status: 'SENT',
    });
    const [url, request] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://api.zeptomail.in/v1.1/email/template');
    expect(request?.headers).toMatchObject({
      Authorization: 'Zoho-enczapikey test-token',
      'Content-Type': 'application/json',
      Accept: 'application/json',
    });
    const requestBody = request?.body;
    expect(typeof requestBody).toBe('string');
    if (typeof requestBody !== 'string')
      throw new Error('Expected a JSON string request body');
    const body = JSON.parse(requestBody);
    expect(body.template_alias).toBe('login-details');
    expect(body.from).toEqual({
      address: 'noreply@balatrix.ca',
      name: 'Balatrix',
    });
    expect(body.to[0].email_address).toEqual({
      address: 'owner@example.com',
      name: '<Owner>',
    });
    expect(body.merge_info).toEqual({
      admin_name: '<Owner>',
      customer_id: 'CUST1001',
      login_id: 'owner@example.com',
      password: 'TemporarySecret123',
      portal_link: 'https://bswitch.balatrix.com',
    });
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
