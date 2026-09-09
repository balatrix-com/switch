import { NotFoundException } from '@nestjs/common';
import { NumberInventoryStatus } from '@prisma/client';
import { CustomersService } from '../src/customers/customers.service';
import { CustomersController } from '../src/customers/customers.controller';

describe('CustomersService - remove', () => {
  let service: CustomersService;
  let prisma: any;
  let kamailio: any;
  let routeXml: any;
  let didXml: any;
  let routing: any;
  let subscriptionClient: any;

  beforeEach(() => {
    prisma = {
      customer: {
        findUnique: jest.fn(),
        delete: jest.fn(),
      },
      sourceIpAuth: {
        findMany: jest.fn(),
      },
      routeXml: {
        findMany: jest.fn(),
      },
      customerNumber: {
        findMany: jest.fn(),
      },
      globalNumberInventory: {
        updateMany: jest.fn(),
      },
      $transaction: jest.fn(async (callback) => {
        return callback(prisma);
      }),
    };

    kamailio = {
      removeSources: jest.fn().mockResolvedValue(undefined),
    };

    routeXml = {
      removeFile: jest.fn().mockResolvedValue(undefined),
    };

    didXml = {
      generateAll: jest.fn().mockResolvedValue(undefined),
    };

    routing = {
      rebuildOutboundRoutes: jest.fn().mockResolvedValue(undefined),
    };

    subscriptionClient = {
      createCustomerWallet: jest.fn().mockResolvedValue(undefined),
    };

    service = new CustomersService(
      prisma,
      didXml,
      routing,
      kamailio,
      subscriptionClient,
      routeXml,
    );
  });

  it('throws NotFoundException when customer does not exist', async () => {
    prisma.customer.findUnique.mockResolvedValue(null);

    await expect(service.remove('non-existent-id')).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.customer.delete).not.toHaveBeenCalled();
    expect(kamailio.removeSources).not.toHaveBeenCalled();
  });

  it('successfully deletes a customer with all associated sources, XMLs, and numbers freed', async () => {
    const mockCustomer = {
      id: 'cust-123',
      accountCode: 'ACC-123',
      name: 'Acme Corp',
      creditBalance: 100,
      currency: 'USD',
      isActive: true,
      settings: null,
    };

    prisma.customer.findUnique.mockResolvedValue(mockCustomer);
    prisma.sourceIpAuth.findMany.mockResolvedValue([
      { id: 'src-1' },
      { id: 'src-2' },
    ]);
    prisma.routeXml.findMany.mockResolvedValue([
      { fileName: 'inbound_123.xml' },
      { fileName: 'outbound_abc.xml' },
    ]);
    prisma.customerNumber.findMany.mockResolvedValue([
      { inventoryId: 'inv-1' },
      { inventoryId: 'inv-2' },
    ]);
    prisma.customer.delete.mockResolvedValue(mockCustomer);

    const result = await service.remove('cust-123');

    expect(result).toEqual({
      success: true,
      message: 'Customer deleted successfully',
      id: 'cust-123',
      accountCode: 'ACC-123',
      name: 'Acme Corp',
    });

    // Verify transaction freed assigned numbers
    expect(prisma.globalNumberInventory.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['inv-1', 'inv-2'] } },
      data: { status: NumberInventoryStatus.AVAILABLE },
    });

    // Verify customer delete call
    expect(prisma.customer.delete).toHaveBeenCalledWith({
      where: { id: 'cust-123' },
    });

    // Verify Kamailio cleanup
    expect(kamailio.removeSources).toHaveBeenCalledWith(['src-1', 'src-2']);

    // Verify disk XML cleanup
    expect(routeXml.removeFile).toHaveBeenCalledWith('inbound_123.xml');
    expect(routeXml.removeFile).toHaveBeenCalledWith('outbound_abc.xml');
  });

  it('handles customer with no numbers or XML gracefully', async () => {
    const mockCustomer = {
      id: 'cust-clean',
      accountCode: 'CLEAN',
      name: 'Clean Customer',
      settings: null,
    };

    prisma.customer.findUnique.mockResolvedValue(mockCustomer);
    prisma.sourceIpAuth.findMany.mockResolvedValue([]);
    prisma.routeXml.findMany.mockResolvedValue([]);
    prisma.customerNumber.findMany.mockResolvedValue([]);
    prisma.customer.delete.mockResolvedValue(mockCustomer);

    const result = await service.remove('cust-clean');

    expect(result.success).toBe(true);
    expect(prisma.globalNumberInventory.updateMany).not.toHaveBeenCalled();
    expect(prisma.customer.delete).toHaveBeenCalledWith({
      where: { id: 'cust-clean' },
    });
    expect(kamailio.removeSources).not.toHaveBeenCalled();
    expect(routeXml.removeFile).not.toHaveBeenCalled();
  });

  it('does not fail if Kamailio cleanup or file removal logs a warning', async () => {
    const mockCustomer = {
      id: 'cust-warn',
      accountCode: 'WARN',
      name: 'Warning Customer',
      settings: null,
    };

    prisma.customer.findUnique.mockResolvedValue(mockCustomer);
    prisma.sourceIpAuth.findMany.mockResolvedValue([{ id: 'src-fail' }]);
    prisma.routeXml.findMany.mockResolvedValue([{ fileName: 'file-fail.xml' }]);
    prisma.customerNumber.findMany.mockResolvedValue([]);
    prisma.customer.delete.mockResolvedValue(mockCustomer);

    kamailio.removeSources.mockRejectedValue(new Error('Kamailio down'));
    routeXml.removeFile.mockRejectedValue(new Error('File not found'));

    const result = await service.remove('cust-warn');

    expect(result.success).toBe(true);
    expect(prisma.customer.delete).toHaveBeenCalledWith({
      where: { id: 'cust-warn' },
    });
  });
});

describe('CustomersController - remove', () => {
  it('delegates deletion to CustomersService.remove', async () => {
    const mockService = {
      remove: jest.fn().mockResolvedValue({
        success: true,
        message: 'Customer deleted successfully',
        id: 'cust-123',
      }),
    };

    const controller = new CustomersController(mockService as any);
    const result = await controller.remove('cust-123');

    expect(mockService.remove).toHaveBeenCalledWith('cust-123');
    expect(result).toEqual({
      success: true,
      message: 'Customer deleted successfully',
      id: 'cust-123',
    });
  });
});
