import { Test, TestingModule } from '@nestjs/testing';
import { BillingService } from '../src/billing/billing.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

describe('Recording Rate Cards Service (e2e)', () => {
  let service: BillingService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingService,
        {
          provide: PrismaService,
          useValue: {
            recordingRateCard: {
              findMany: jest.fn(),
              findUnique: jest.fn(),
              findFirst: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
              delete: jest.fn(),
            },
            customerRecordingRateCard: {
              findMany: jest.fn(),
              upsert: jest.fn(),
              delete: jest.fn(),
            },
            customer: {
              findUnique: jest.fn(),
            },
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<BillingService>(BillingService);
    prisma = module.get<PrismaService>(PrismaService);

    // Mock fetch for cache refresh
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({}),
    }) as jest.Mock;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createRecordingRateCard', () => {
    it('should create a recording rate card', async () => {
      const dto = { name: 'Test', rate: '0.5', pulse: 60, days: 30, activeIs: 'Y' as const };
      (prisma.recordingRateCard.create as jest.Mock).mockResolvedValue({ id: 1, ...dto });

      const result = await service.createRecordingRateCard(dto);
      expect(result.data).toEqual({ id: 1, ...dto });
      expect(result.cacheRefresh.status).toBe('skipped'); // Mock config returns undefined for URL
    });

    it('should handle unique constraint violation', async () => {
      const dto = { name: 'Test', rate: '0.5', pulse: 60, days: 30, activeIs: 'Y' as const };
      const error = new Prisma.PrismaClientKnownRequestError('Error', { code: 'P2002', clientVersion: 'test' });
      (prisma.recordingRateCard.create as jest.Mock).mockRejectedValue(error);

      await expect(service.createRecordingRateCard(dto)).rejects.toThrow(ConflictException);
    });
  });

  describe('updateRecordingRateCard', () => {
    it('should throw NotFoundException if rate card does not exist', async () => {
      (prisma.recordingRateCard.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(service.updateRecordingRateCard(999, {})).rejects.toThrow(NotFoundException);
    });

    it('should update rate card if exists', async () => {
      const existing = { id: 1, name: 'Old' };
      (prisma.recordingRateCard.findUnique as jest.Mock).mockResolvedValue(existing);
      (prisma.recordingRateCard.update as jest.Mock).mockResolvedValue({ id: 1, name: 'New' });

      const result = await service.updateRecordingRateCard(1, { name: 'New' });
      expect(result.data.name).toBe('New');
    });
  });

  describe('assignCustomerRecordingRateCard', () => {
    it('should assign customer successfully', async () => {
      const customer = { id: 'cust123' };
      const rateCard = { id: 1, activeIs: 'Y' };
      (prisma.customer.findUnique as jest.Mock).mockResolvedValue(customer);
      (prisma.recordingRateCard.findFirst as jest.Mock).mockResolvedValue(rateCard);
      (prisma.customerRecordingRateCard.upsert as jest.Mock).mockResolvedValue({ custId: 'cust123', recRcId: 1 });

      const result = await service.assignCustomerRecordingRateCard('cust123', { recRcId: 1 });
      expect(result.data).toEqual({ custId: 'cust123', recRcId: 1 });
    });

    it('should throw NotFoundException if customer missing', async () => {
      (prisma.customer.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.recordingRateCard.findFirst as jest.Mock).mockResolvedValue({ id: 1 });
      await expect(service.assignCustomerRecordingRateCard('invalid', { recRcId: 1 })).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if rate card is missing or inactive', async () => {
      (prisma.customer.findUnique as jest.Mock).mockResolvedValue({ id: 'cust' });
      (prisma.recordingRateCard.findFirst as jest.Mock).mockResolvedValue(null);
      await expect(service.assignCustomerRecordingRateCard('cust', { recRcId: 1 })).rejects.toThrow(BadRequestException);
    });
  });

  describe('removeRecordingRateCard', () => {
    it('should delete rate card if no constraints violated', async () => {
      (prisma.recordingRateCard.findUnique as jest.Mock).mockResolvedValue({ id: 1 });
      (prisma.recordingRateCard.delete as jest.Mock).mockResolvedValue({ id: 1 });
      const result = await service.removeRecordingRateCard(1);
      expect(result.data.id).toBe(1);
    });

    it('should throw ConflictException if foreign key constraint fails', async () => {
      (prisma.recordingRateCard.findUnique as jest.Mock).mockResolvedValue({ id: 1 });
      const error = new Prisma.PrismaClientKnownRequestError('FK error', { code: 'P2003', clientVersion: 'test' });
      (prisma.recordingRateCard.delete as jest.Mock).mockRejectedValue(error);
      
      await expect(service.removeRecordingRateCard(1)).rejects.toThrow(ConflictException);
    });
  });
});
