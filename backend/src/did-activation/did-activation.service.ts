import { Injectable, NotFoundException } from '@nestjs/common';
import {
  CustomerNumberStatus,
  NumberInventoryStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DidXmlGenerationService } from '../route-xml/did-xml-generation.service';
import { RouteXmlService } from '../route-xml/route-xml.service';

export type DidActivationSource = 'admin' | 'subscription';
export type DidActivationStatus =
  | 'ACTIVE'
  | 'DISABLED_BY_ADMIN'
  | 'DEACTIVATED_BY_SUBSCRIPTION';

type DidState = {
  status: NumberInventoryStatus;
  manuallyDisabled: boolean;
  subscriptionDisabled: boolean;
  assignment?: { status: CustomerNumberStatus } | null;
};

export function didActivationStatus(number: DidState): DidActivationStatus {
  if (number.subscriptionDisabled) return 'DEACTIVATED_BY_SUBSCRIPTION';
  if (
    number.manuallyDisabled ||
    number.status === NumberInventoryStatus.SUSPENDED ||
    number.assignment?.status === CustomerNumberStatus.SUSPENDED
  ) return 'DISABLED_BY_ADMIN';
  return 'ACTIVE';
}

@Injectable()
export class DidActivationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly didXml: DidXmlGenerationService,
    private readonly routeXml: RouteXmlService,
  ) {}

  async setActivation(
    inventoryId: string,
    source: DidActivationSource,
    enabled: boolean,
  ) {
    let result: Awaited<ReturnType<typeof this.updateState>> | undefined;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        result = await this.updateState(inventoryId, source, enabled);
        break;
      } catch (error) {
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          error.code !== 'P2034' ||
          attempt === 2
        ) throw error;
      }
    }
    if (!result) throw new Error('DID activation transaction did not complete');

    let routeWarning: string | undefined;
    if (result.assignment) {
      if (result.disabled) {
        await this.routeXml.invalidateDid(result.assignment.customerId, result.assignment.id);
      } else {
        try {
          await this.didXml.generate(result.assignment.customerId, result.assignment.id);
        } catch (error) {
          await this.routeXml.invalidateDid(result.assignment.customerId, result.assignment.id);
          routeWarning = `DID enabled, but its route could not be rebuilt: ${error instanceof Error ? error.message : 'unknown error'}`;
        }
      }
    }

    return {
      ...result.inventory,
      activationStatus: didActivationStatus({ ...result.inventory, assignment: result.assignment }),
      ...(routeWarning ? { routeWarning } : {}),
    };
  }

  private updateState(inventoryId: string, source: DidActivationSource, enabled: boolean) {
    return this.prisma.$transaction(async (tx) => {
      const inventory = await tx.globalNumberInventory.findUnique({
        where: { id: inventoryId },
        include: { assignment: true },
      });
      if (!inventory) throw new NotFoundException('DID not found in global inventory');

      const manuallyDisabled = source === 'admin' ? !enabled : inventory.manuallyDisabled;
      const subscriptionDisabled = source === 'subscription' ? !enabled : inventory.subscriptionDisabled;
      const disabled = manuallyDisabled || subscriptionDisabled;
      const desiredAssignmentStatus = disabled
        ? CustomerNumberStatus.SUSPENDED
        : CustomerNumberStatus.ACTIVE;

      // SUSPENDED is a legacy inventory status. Ownership stays AVAILABLE/ASSIGNED
      // for new toggles; activation is tracked by the two independent flags.
      const inventoryStatus = inventory.status === NumberInventoryStatus.SUSPENDED && !disabled
        ? inventory.assignment ? NumberInventoryStatus.ASSIGNED : NumberInventoryStatus.AVAILABLE
        : inventory.status;
      const updated = await tx.globalNumberInventory.update({
        where: { id: inventoryId },
        data: {
          manuallyDisabled,
          subscriptionDisabled,
          status: inventoryStatus,
        },
      });
      const assignment = inventory.assignment
        ? await tx.customerNumber.update({
            where: { id: inventory.assignment.id },
            data: { status: desiredAssignmentStatus },
          })
        : null;
      return { inventory: updated, assignment, disabled };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}
