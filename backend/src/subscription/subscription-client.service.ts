import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  GatewayTimeoutException,
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SubscriptionClientService {
  private readonly logger = new Logger(SubscriptionClientService.name);
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(private readonly config: ConfigService) {
    this.baseUrl = this.config
      .get<string>('SUBSCRIPTION_SERVICE_URL', 'http://127.0.0.1:5010')
      .replace(/\/$/, '');
    this.timeoutMs = Number(
      this.config.get<number>('SUBSCRIPTION_SERVICE_TIMEOUT_MS', 5000),
    );
  }

  private async request<T>(
    endpoint: string,
    options: {
      method?: string;
      body?: unknown;
      params?: Record<string, string | undefined>;
    } = {},
  ): Promise<T> {
    const { method = 'GET', body, params } = options;

    let url = `${this.baseUrl}${endpoint}`;
    if (params) {
      const searchParams = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null && value !== '') {
          searchParams.append(key, value);
        }
      }
      const qs = searchParams.toString();
      if (qs) {
        url += (url.includes('?') ? '&' : '?') + qs;
      }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      this.logger.debug(`[SubscriptionClient] ${method} ${url}`);
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      const contentType = response.headers.get('content-type') || '';
      const isJson = contentType.includes('application/json');
      const responseData = isJson ? await response.json() : await response.text();

      if (!response.ok) {
        const errorMessage =
          (typeof responseData === 'object' && responseData && (responseData.error || responseData.message)) ||
          `Subscription service error (HTTP ${response.status})`;

        this.logger.warn(
          `[SubscriptionClient] Error response from ${method} ${url}: ${response.status} - ${JSON.stringify(responseData)}`,
        );

        switch (response.status) {
          case 400:
            throw new BadRequestException(errorMessage);
          case 402:
            throw new HttpException(errorMessage, HttpStatus.PAYMENT_REQUIRED);
          case 404:
            throw new NotFoundException(errorMessage);
          case 409:
            throw new ConflictException(errorMessage);
          default:
            throw new BadGatewayException(errorMessage);
        }
      }

      return responseData as T;
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }

      if (error instanceof Error && error.name === 'AbortError') {
        this.logger.error(
          `[SubscriptionClient] Timeout after ${this.timeoutMs}ms calling ${method} ${url}`,
        );
        throw new GatewayTimeoutException(
          `Subscription service request timed out after ${this.timeoutMs}ms`,
        );
      }

      this.logger.error(
        `[SubscriptionClient] Network or unhandled failure calling ${method} ${url}: ${(error as Error).message}`,
        (error as Error).stack,
      );
      throw new BadGatewayException(
        `Failed to reach subscription service at ${this.baseUrl}: ${(error as Error).message}`,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  // --- Plans APIs ---

  async listPlans(params?: { status?: string; plan_category?: string }) {
    return this.request('/plans', {
      method: 'GET',
      params: {
        status: params?.status,
        plan_category: params?.plan_category,
      },
    });
  }

  async getPlan(id: string) {
    return this.request(`/plans/${encodeURIComponent(id)}`, { method: 'GET' });
  }

  async createPlan(data: unknown) {
    return this.request('/plans', { method: 'POST', body: data });
  }

  async updatePlan(id: string, data: unknown) {
    return this.request(`/plans/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: data,
    });
  }

  async deletePlan(id: string) {
    return this.request(`/plans/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  async subscribePlan(data: {
    customer_id: string;
    plan_id: string;
    override_balance_check?: boolean;
  }) {
    return this.request('/plans/subscribe', {
      method: 'POST',
      body: data,
    });
  }

  // --- Wallets APIs ---

  async getWallet(customerId: string) {
    return this.request(`/wallets/${encodeURIComponent(customerId)}`, {
      method: 'GET',
    });
  }

  async createCustomerWallet(
    customerId: string,
    fiatBalance = 0,
    currency = 'USD',
    creditLimit?: number,
  ) {
    const limit = creditLimit !== undefined ? Number(creditLimit) : Number(fiatBalance) || 0;
    return this.request('/wallets/customer', {
      method: 'POST',
      body: {
        customer_id: customerId,
        fiat_balance: Number(fiatBalance) || 0,
        credit_limit: limit,
        currency,
      },
    });
  }

  async adjustWallet(customerId: string, data: unknown) {
    return this.request(`/wallets/${encodeURIComponent(customerId)}`, {
      method: 'PATCH',
      body: data,
    });
  }

  async deductWallet(data: {
    customer_id: string;
    usage_type: string;
    duration_seconds?: number;
    amount?: number;
  }) {
    return this.request('/wallets/deduct', {
      method: 'POST',
      body: data,
    });
  }

  // --- Number Asset Assignment & Lifecycle ---

  async assignNumberAsset(data: {
    customer_id: string;
    number: string;
    number_type?: string;
    plan_id?: string;
  }) {
    return this.request('/number_assigning', {
      method: 'POST',
      body: {
        custid: data.customer_id,
        canonical_number: data.number,
        type: data.number_type || 'DID',
        plan_id: data.plan_id,
      },
    });
  }

  async unassignNumberAsset(data: {
    customer_id: string;
    number: string;
  }) {
    return this.request('/number_unassigning', {
      method: 'POST',
      body: {
        custid: data.customer_id,
        canonical_number: data.number,
      },
    });
  }

  async getCustomerNumberAssets(customerId: string) {
    return this.request(`/number_assets/${encodeURIComponent(customerId)}`, {
      method: 'GET',
    });
  }

  // --- Management APIs ---

  async getCustomerPackages(customerId: string) {
    return this.request(`/management/customers/${encodeURIComponent(customerId)}/packages`, {
      method: 'GET',
    });
  }

  // --- Subscription APIs ---

  async getCustomerSubscriptions(customerId: string) {
    return this.request(`/subscriptions/customer/${encodeURIComponent(customerId)}`, {
      method: 'GET',
    });
  }

  async getSubscriptionById(subscriptionId: string) {
    return this.request(`/subscriptions/${encodeURIComponent(subscriptionId)}`, {
      method: 'GET',
    });
  }

  async toggleRenewal(subscriptionId: string, renewal: boolean) {
    return this.request(`/subscriptions/${encodeURIComponent(subscriptionId)}/renewal`, {
      method: 'PATCH',
      body: { renewal },
    });
  }

  async releaseSubscriptionNumbers(subscriptionId: string) {
    return this.request(`/subscriptions/${encodeURIComponent(subscriptionId)}/release-numbers`, {
      method: 'POST',
    });
  }

  async getCustomerRenewalLogs(customerId: string) {
    return this.request(`/renewal-logs/customer/${encodeURIComponent(customerId)}`, {
      method: 'GET',
    });
  }
}
