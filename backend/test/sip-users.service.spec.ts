import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { SipUsersService } from '../src/sip-users/sip-users.service';

describe('SipUsersService', () => {
  let service: SipUsersService;
  let prisma: any;
  let kamailio: any;
  let xmlCurlCache: any;
  let config: any;
  let entitlements: any;

  beforeEach(() => {
    prisma = {
      customer: {
        findUnique: jest.fn(),
      },
      sipUser: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    kamailio = {
      upsertSubscriber: jest.fn().mockResolvedValue(undefined),
      removeSubscriber: jest.fn().mockResolvedValue(undefined),
      registeredUsers: jest.fn().mockResolvedValue(new Set()),
    };
    xmlCurlCache = {
      flush: jest.fn().mockResolvedValue({ flushed: true }),
    };
    config = {
      get: jest.fn().mockReturnValue('billing-switch'),
    };
    entitlements = {
      assertCanCreateMonitorExtension: jest.fn().mockResolvedValue(undefined),
    };
    service = new SipUsersService(
      prisma,
      kamailio,
      xmlCurlCache,
      entitlements,
      config,
    );
  });

  describe('list', () => {
    it('returns limit, used, available, and users with online status', async () => {
      prisma.customer.findUnique.mockResolvedValue({ extensionLimit: 5 });
      prisma.sipUser.findMany.mockResolvedValue([
        {
          id: 'u1',
          username: '203',
          secretHash: 'hash1',
          sipProfile: 'internal',
          isActive: true,
          customerId: 'cust-1',
        },
        {
          id: 'u2',
          username: '204',
          secretHash: 'hash2',
          sipProfile: 'internal',
          isActive: true,
          customerId: 'cust-1',
        },
      ]);
      kamailio.registeredUsers.mockResolvedValue(new Set(['203']));

      const result = await service.list('cust-1');

      expect(result.limit).toBe(5);
      expect(result.used).toBe(2);
      expect(result.available).toBe(3);
      expect(result.users).toHaveLength(2);
      expect(result.users[0]).toMatchObject({ username: '203', online: true });
      expect(result.users[1]).toMatchObject({ username: '204', online: false });
      expect((result.users[0] as any).secretHash).toBeUndefined();
    });
  });

  describe('create', () => {
    it('rejects a second monitoring extension for the customer', async () => {
      prisma.customer.findUnique.mockResolvedValue({ extensionLimit: 10 });
      prisma.sipUser.count.mockResolvedValue(1);
      prisma.sipUser.findFirst.mockResolvedValue({ id: 'monitor-1' });
      await expect(
        service.create('cust-1', {
          username: '901',
          password: 'secretPassword123',
          isMonitor: true,
        }),
      ).rejects.toThrow(
        'Only one monitoring extension is allowed per customer',
      );
      expect(entitlements.assertCanCreateMonitorExtension).toHaveBeenCalledWith(
        'cust-1',
      );
      expect(prisma.sipUser.create).not.toHaveBeenCalled();
    });
    it('creates extension when under limit, syncs to Kamailio, and flushes cache', async () => {
      prisma.customer.findUnique.mockResolvedValue({ extensionLimit: 2 });
      prisma.sipUser.count.mockResolvedValue(1);
      prisma.sipUser.create.mockResolvedValue({
        id: 'u2',
        username: '204',
        secretHash: 'calculated-hash',
        sipProfile: 'internal',
        isActive: true,
        customerId: 'cust-1',
      });

      const result = await service.create('cust-1', {
        username: '204',
        password: 'secretPassword123',
        sipProfile: 'internal',
        isActive: true,
      });

      expect(result.username).toBe('204');
      expect(kamailio.upsertSubscriber).toHaveBeenCalledWith(
        expect.objectContaining({
          username: '204',
          realm: 'billing-switch',
          isActive: true,
        }),
      );
      expect(xmlCurlCache.flush).toHaveBeenCalled();
    });

    it('rejects when extension limit is reached', async () => {
      prisma.customer.findUnique.mockResolvedValue({ extensionLimit: 2 });
      prisma.sipUser.count.mockResolvedValue(2);

      await expect(
        service.create('cust-1', {
          username: '205',
          password: 'secretPassword123',
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.create('cust-1', {
          username: '205',
          password: 'secretPassword123',
        }),
      ).rejects.toThrow(
        'Extension limit reached. This customer can create only 2 extensions.',
      );
      expect(prisma.sipUser.create).not.toHaveBeenCalled();
    });

    it('throws ConflictException on duplicate username', async () => {
      prisma.customer.findUnique.mockResolvedValue({ extensionLimit: 10 });
      prisma.sipUser.count.mockResolvedValue(0);
      prisma.sipUser.create.mockRejectedValue({ code: 'P2002' });

      await expect(
        service.create('cust-1', {
          username: '203',
          password: 'secretPassword123',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('resetPassword', () => {
    it('updates secretHash in DB, syncs to Kamailio, and flushes cache', async () => {
      prisma.sipUser.findFirst.mockResolvedValue({
        id: 'u1',
        username: '203',
        customerId: 'cust-1',
        isActive: true,
      });
      prisma.sipUser.update.mockResolvedValue({
        id: 'u1',
        username: '203',
        secretHash: 'new-hash',
        sipProfile: 'internal',
        isActive: true,
        customerId: 'cust-1',
      });

      const result = await service.resetPassword(
        'cust-1',
        'u1',
        'newPassword999',
      );

      expect(result.username).toBe('203');
      expect(prisma.sipUser.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'u1' },
          data: expect.objectContaining({ secretHash: expect.any(String) }),
        }),
      );
      expect(kamailio.upsertSubscriber).toHaveBeenCalledWith(
        expect.objectContaining({
          username: '203',
          realm: 'billing-switch',
          isActive: true,
        }),
      );
      expect(xmlCurlCache.flush).toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('removes from DB, Kamailio subscriber table, and flushes cache', async () => {
      prisma.sipUser.findFirst.mockResolvedValue({
        id: 'u1',
        username: '203',
        customerId: 'cust-1',
      });
      prisma.sipUser.delete.mockResolvedValue({ id: 'u1' });

      const result = await service.remove('cust-1', 'u1');

      expect(result).toEqual({ deleted: true });
      expect(kamailio.removeSubscriber).toHaveBeenCalledWith(
        '203',
        'billing-switch',
      );
      expect(prisma.sipUser.delete).toHaveBeenCalledWith({
        where: { id: 'u1' },
      });
      expect(xmlCurlCache.flush).toHaveBeenCalled();
    });
  });
});
