import { Controller, Get, INestApplication, Param } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Role } from '@prisma/client';
import request from 'supertest';
import { CustomerId } from '../src/common/decorators/customer-id.decorator';

@Controller('context-test')
class ContextTestController {
  @Get()
  read(@CustomerId() customerId: string) {
    return { customerId };
  }

  @Get(':customerId')
  readParam(@CustomerId() customerId: string, @Param('customerId') _id: string) {
    return { customerId };
  }
}

describe('Authenticated customer context', () => {
  let app: INestApplication;
  const customerA = '100001';
  const customerB = '100002';

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ContextTestController],
    }).compile();
    app = module.createNestApplication();
    app.use((req: any, _res: any, next: () => void) => {
      if (req.headers['x-test-role']) {
        req.user = {
          id: 'test-user',
          email: 'test@example.com',
          name: 'Test',
          role: req.headers['x-test-role'] as Role,
          customerId: req.headers['x-test-customer'] || null,
          assignedCustomerIds: String(req.headers['x-test-assignments'] || '').split(',').filter(Boolean),
        };
      }
      next();
    });
    await app.init();
  });

  afterAll(async () => app.close());

  it('rejects requests without an authenticated user', async () => {
    await request(app.getHttpServer()).get('/context-test').expect(403);
  });

  it('ignores a spoofed tenant header for customer users', async () => {
    const response = await request(app.getHttpServer())
      .get('/context-test')
      .set('x-test-role', Role.CUSTOMER)
      .set('x-test-customer', customerA)
      .set('X-Customer-ID', customerB)
      .expect(200);
    expect(response.body).toEqual({ customerId: customerA });
  });

  it('lets a super admin select a tenant through the route parameter', async () => {
    const response = await request(app.getHttpServer())
      .get(`/context-test/${customerB}`)
      .set('x-test-role', Role.SUPER_ADMIN)
      .expect(200);
    expect(response.body).toEqual({ customerId: customerB });
  });

  it('allows a Support Member to select only an assigned customer', async () => {
    const response = await request(app.getHttpServer())
      .get('/context-test')
      .set('x-test-role', Role.SUPPORT_MEMBER)
      .set('x-test-assignments', customerA)
      .set('X-Customer-ID', customerA)
      .expect(200);
    expect(response.body).toEqual({ customerId: customerA });
  });

  it('rejects a Support Member selecting another customer', async () => {
    await request(app.getHttpServer())
      .get('/context-test')
      .set('x-test-role', Role.SUPPORT_MEMBER)
      .set('x-test-assignments', customerA)
      .set('X-Customer-ID', customerB)
      .expect(403);
  });

  it('requires explicit customer context even on optional Support Member endpoints', async () => {
    await request(app.getHttpServer())
      .get('/context-test')
      .set('x-test-role', Role.SUPPORT_MEMBER)
      .set('x-test-assignments', customerA)
      .expect(400);
  });
});
