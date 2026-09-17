import { Injectable } from '@nestjs/common';
import { SubscriptionClientService } from './subscription-client.service';
import { CreatePlanDto, QueryPlansDto, UpdatePlanDto } from './dto/plan.dto';
import { SubscribePlanDto } from './dto/subscribe-plan.dto';

@Injectable()
export class PlansService {
  constructor(private readonly client: SubscriptionClientService) {}

  async list(query?: QueryPlansDto) {
    const res: any = await this.client.listPlans(query);
    return res && Array.isArray(res.data) ? res.data : res;
  }

  async findOne(id: string) {
    const res: any = await this.client.getPlan(id);
    return res && res.data ? res.data : res;
  }

  private normalizePlanData<T extends Record<string, any>>(data: T): T {
    if (!data || !data.validity_unit) return data;
    const lower = String(data.validity_unit).toLowerCase().trim();
    let normalized = lower;
    if (lower === 'days') normalized = 'day';
    else if (lower === 'months') normalized = 'month';
    else if (lower === 'years') normalized = 'year';
    return { ...data, validity_unit: normalized };
  }

  async create(dto: CreatePlanDto) {
    const res: any = await this.client.createPlan(this.normalizePlanData(dto));
    return res && res.data ? res.data : res;
  }

  async update(id: string, dto: UpdatePlanDto) {
    const res: any = await this.client.updatePlan(id, this.normalizePlanData(dto));
    return res && res.data ? res.data : res;
  }

  async remove(id: string) {
    const res: any = await this.client.deletePlan(id);
    return res && res.data ? res.data : res;
  }

  async subscribe(dto: SubscribePlanDto) {
    const res: any = await this.client.subscribePlan(dto);
    return res && res.data ? res.data : res;
  }
}
