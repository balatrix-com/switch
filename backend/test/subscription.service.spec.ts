import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  GatewayTimeoutException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { SubscriptionClientService } from '../src/subscription/subscription-client.service';
import { PlansService } from '../src/subscription/plans.service';
import { WalletsService } from '../src/subscription/wallets.service';
import { PlanCategory } from '../src/subscription/dto/plan.dto';

describe('Subscription Integration & Edge Cases', () => {
  let client: SubscriptionClientService;
  let plansService: PlansService;
  let walletsService: WalletsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriptionClientService,
        PlansService,
        WalletsService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue: unknown) => {
              if (key === 'SUBSCRIPTION_SERVICE_URL')
                return 'http://127.0.0.1:5010';
              if (key === 'SUBSCRIPTION_SERVICE_TIMEOUT_MS') return 500;
              return defaultValue;
            }),
          },
        },
      ],
    }).compile();

    client = module.get<SubscriptionClientService>(SubscriptionClientService);
    plansService = module.get<PlansService>(PlansService);
    walletsService = module.get<WalletsService>(WalletsService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Happy Paths', () => {
    it('should list plans successfully', async () => {
      const mockPlans = [
        { id: 'plan-1', plan_name: 'Asset Plan 1', plan_category: 'asset' },
      ];
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockPlans,
      } as Response);

      const result = await plansService.list({ status: 'active' });
      expect(result).toEqual(mockPlans);
    });

    it('should create plan successfully', async () => {
      const newPlan = {
        plan_name: 'Test Plan',
        plan_category: PlanCategory.ASSET,
      };
      const createdPlan = { id: 'plan-new', ...newPlan };
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => createdPlan,
      } as Response);

      const result = await plansService.create(newPlan);
      expect(result).toEqual(createdPlan);
    });

    it('should fetch customer wallet successfully', async () => {
      const mockWallet = {
        customer_id: 'cust-101',
        fiat_balance: '150.00',
        currency: 'USD',
        tfn_free_minutes: 500,
        did_free_minutes: 250,
        ob_free_minutes: 1000,
      };
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockWallet,
      } as Response);

      const result = await walletsService.getWallet('cust-101');
      expect(result).toEqual(mockWallet);
    });

    it('should deduct wallet balance successfully', async () => {
      const mockDeductResponse = {
        success: true,
        deducted_minutes: 2,
        remaining_minutes: 498,
      };
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockDeductResponse,
      } as Response);

      const result = await walletsService.deduct({
        customer_id: 'cust-101',
        usage_type: 'TFN',
        duration_seconds: 120,
      });
      expect(result).toEqual(mockDeductResponse);
    });

    it('should subscribe customer to plan successfully', async () => {
      const mockSubResponse = {
        success: true,
        data: {
          subscription_id: 'sub-uuid-1',
          customer_id: 'cust-101',
          plan_id: 'plan-101',
          otc_charged: 49.0,
          status: 'active',
        },
      };
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockSubResponse,
      } as Response);

      const result = await plansService.subscribe({
        customer_id: 'cust-101',
        plan_id: 'plan-101',
      });
      expect(result).toEqual(mockSubResponse.data);
    });

    it('should use the bswitchsub DELETE plan contract', async () => {
      const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ data: { id: 'plan-1', status: 'inactive' } }),
      } as Response);

      await plansService.remove('plan-1');

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://127.0.0.1:5010/plans/plan-1',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });

    it('should use the bswitchsub four-pocket wallet creation contract', async () => {
      const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ data: { customer_id: 'cust-101' } }),
      } as Response);

      await client.createCustomerWallet('cust-101', 25, 'USD', 100);

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://127.0.0.1:5010/wallets/customer',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            customer_id: 'cust-101',
            fiat_balance: 25,
            credit_limit: 100,
            currency: 'USD',
          }),
        }),
      );
    });
  });

  describe('Critical Edge Cases & Error Handling', () => {
    it('Edge Case 1: should handle Network Timeout and throw GatewayTimeoutException (504)', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      jest.spyOn(global, 'fetch').mockRejectedValueOnce(abortError);

      await expect(plansService.list()).rejects.toThrow(
        GatewayTimeoutException,
      );
    });

    it('Edge Case 2: should handle Upstream Connection Refused and throw BadGatewayException (502)', async () => {
      jest
        .spyOn(global, 'fetch')
        .mockRejectedValueOnce(
          new Error('connect ECONNREFUSED 127.0.0.1:5010'),
        );

      await expect(walletsService.getWallet('cust-999')).rejects.toThrow(
        BadGatewayException,
      );
    });

    it('Edge Case 3: should handle 404 Not Found and throw NotFoundException', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 404,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ error: 'Plan not found' }),
      } as Response);

      await expect(plansService.findOne('non-existent-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('Edge Case 4: should handle 400 Bad Request / Validation Failure and throw BadRequestException', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 400,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ error: 'Plan asset limit exceeded for customer' }),
      } as Response);

      await expect(
        walletsService.assignNumber({
          customer_id: 'cust-1',
          plan_id: 'plan-1',
          number_type: 'TFN',
          number: '+18001234567',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('Edge Case 5: should handle 409 Conflict and throw ConflictException', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 409,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ error: 'Number already assigned to customer' }),
      } as Response);

      await expect(
        walletsService.assignNumber({
          customer_id: 'cust-1',
          plan_id: 'plan-1',
          number_type: 'DID',
          number: '+15551234567',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('Edge Case 6: should handle Non-JSON upstream error responses without crashing', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 502,
        headers: new Headers({ 'content-type': 'text/html' }),
        text: async () => '<html><body>Bad Gateway</body></html>',
      } as Response);

      await expect(plansService.list()).rejects.toThrow(BadGatewayException);
    });

    it('Edge Case 7: should handle 402 Payment Required for insufficient wallet balance', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 402,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          success: false,
          message: 'Insufficient wallet balance',
        }),
      } as Response);

      await expect(
        plansService.subscribe({
          customer_id: 'cust-101',
          plan_id: 'plan-101',
        }),
      ).rejects.toThrow('Insufficient wallet balance');
    });
  });
});
