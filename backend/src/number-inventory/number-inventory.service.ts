import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { NumberInventoryStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AssignNumberDto } from './dto/assign-number.dto';
import { CreateInventoryNumberDto } from './dto/create-inventory-number.dto';
import { RouteXmlService } from '../route-xml/route-xml.service';
import { SubscriptionClientService } from '../subscription/subscription-client.service';

@Injectable()
export class NumberInventoryService {
  private readonly logger = new Logger(NumberInventoryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly routeXml: RouteXmlService,
    private readonly subscriptionClient: SubscriptionClientService,
  ) {}

  list(status?: NumberInventoryStatus) {
    return this.prisma.globalNumberInventory.findMany({
      where: status ? { status } : undefined,
      include: { assignment: { include: { customer: true } } },
      orderBy: { canonicalNumber: 'asc' },
    });
  }

  async create(dto: CreateInventoryNumberDto) {
    this.validateCanonical(dto.canonicalNumber);
    try {
      return await this.prisma.globalNumberInventory.create({
        data: {
          ...dto,
          metadata: dto.metadata as Prisma.InputJsonValue | undefined,
        },
      });
    } catch (error: unknown) {
      if (this.isCanonicalNumberConflict(error)) {
        const existing = await this.prisma.globalNumberInventory.findUnique({
          where: { canonicalNumber: dto.canonicalNumber },
          select: { id: true, canonicalNumber: true, status: true },
        });
        throw new ConflictException({
          statusCode: 409,
          error: 'Conflict',
          message: 'Number already exists in global inventory',
          canonicalNumber: dto.canonicalNumber,
          existing,
        });
      }
      throw error;
    }
  }

  async assign(inventoryId: string, dto: AssignNumberDto) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: dto.customerId, isActive: true },
    });
    if (!customer)
      throw new BadRequestException('Customer is not active or does not exist');

    const inventory = await this.prisma.globalNumberInventory.findUnique({
      where: { id: inventoryId },
    });
    if (!inventory)
      throw new NotFoundException('Number not found in global inventory');
    if (inventory.status !== NumberInventoryStatus.AVAILABLE)
      throw new ConflictException('Number is not available for assignment');

    // Strict Enforcement: Claim asset slot in bswitchsub
    // If customer has no active asset plan or quota exhausted, throws 404/409 Conflict
    const assetSync = await this.subscriptionClient.assignNumberAsset({
      customer_id: dto.customerId,
      number: inventory.canonicalNumber,
      number_type: inventory.numberType || 'DID',
    });

    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const claimed = await tx.globalNumberInventory.updateMany({
          where: {
            id: inventoryId,
            status: NumberInventoryStatus.AVAILABLE,
            assignment: null,
          },
          data: { status: NumberInventoryStatus.ASSIGNED },
        });
        if (claimed.count !== 1)
          throw new ConflictException('Number is not available for assignment');
        return tx.customerNumber.create({
          data: { customerId: dto.customerId, inventoryId, label: dto.label },
          include: { inventory: true },
        });
      });

      return {
        ...created,
        assetSync,
      };
    } catch (dbError) {
      // Compensation rollback in bswitchsub if database transaction fails
      try {
        await this.subscriptionClient.unassignNumberAsset({
          customer_id: dto.customerId,
          number: inventory.canonicalNumber,
        });
      } catch (rollbackError) {
        this.logger.error(
          `Failed to compensate unassign in bswitchsub for ${inventory.canonicalNumber}: ${(rollbackError as Error).message}`,
        );
      }
      throw dbError;
    }
  }

  async unassign(inventoryId: string) {
    const assignment = await this.prisma.customerNumber.findUnique({
      where: { inventoryId },
      include: { inventory: true, xml: true },
    });
    if (!assignment) throw new NotFoundException('Number is not assigned');
    const activeRoutes = await this.prisma.switchRoute.count({
      where: { customerNumberId: assignment.id, isActive: true },
    });
    if (activeRoutes > 0) {
      throw new ConflictException(
        'Disable or delete active routes before unassigning this number',
      );
    }
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.customerNumber.delete({ where: { id: assignment.id } });
      return tx.globalNumberInventory.update({
        where: { id: inventoryId },
        data: { status: NumberInventoryStatus.AVAILABLE },
      });
    });
    await this.routeXml.removeFile(assignment.xml?.fileName);

    // Synchronize release back to bswitchsub number_assets
    try {
      await this.subscriptionClient.unassignNumberAsset({
        customer_id: assignment.customerId,
        number: assignment.inventory.canonicalNumber,
      });
    } catch (error) {
      this.logger.warn(
        `Failed to release number asset in bswitchsub for ${assignment.inventory.canonicalNumber}: ${(error as Error).message}`,
      );
    }

    return result;
  }

  private validateCanonical(value: string): void {
    if (!/^\+?\d{3,39}$/.test(value)) {
      throw new BadRequestException(
        'canonicalNumber must contain digits with an optional leading plus',
      );
    }
  }

  private isCanonicalNumberConflict(error: unknown): boolean {
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== 'P2002'
    ) {
      return false;
    }

    const target = error.meta?.target;
    const fields = Array.isArray(target)
      ? target.map(String)
      : [String(target)];
    return fields.some(
      (field) => field === 'canonical_number' || field === 'canonicalNumber',
    );
  }
}
