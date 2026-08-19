import { Controller, Get, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { CustomerId } from '../src/common/decorators/customer-id.decorator';

@Controller('context-test')
class ContextTestController {
  @Get()
  read(@CustomerId() customerId: string) {
    return { customerId };
  }
}

describe('X-Customer-ID context', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ContextTestController],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => app.close());

  it('rejects a missing customer context', async () => {
    await request(app.getHttpServer()).get('/context-test').expect(400);
  });

  it('rejects a malformed customer context', async () => {
    await request(app.getHttpServer())
      .get('/context-test')
      .set('X-Customer-ID', 'customer-one')
      .expect(400);
  });

  it('returns a validated upstream customer context', async () => {
    const customerId = '2d0e8b1d-55f2-4d45-9cf8-d91e6c59db3e';
    const response = await request(app.getHttpServer())
      .get('/context-test')
      .set('X-Customer-ID', customerId)
      .expect(200);
    expect(response.body).toEqual({ customerId });
  });
});
