import { SupportAccess } from '../auth/decorators/support-access.decorator';
import { Controller, Get, Param, Post } from '@nestjs/common';
import { ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { CustomerId } from '../common/decorators/customer-id.decorator';
import { RouteXmlService } from './route-xml.service';
import { DidXmlGenerationService } from './did-xml-generation.service';

@ApiTags('Route XML')
@ApiSecurity('customer-context')
@SupportAccess()
@Controller('route-xml')
export class RouteXmlController {
  constructor(
    private readonly routeXml: RouteXmlService,
    private readonly didXml: DidXmlGenerationService,
  ) {}

  @Get()
  list(@CustomerId() customerId: string) {
    return this.routeXml.list(customerId);
  }

  @Get('did/:customerNumberId')
  findDid(
    @CustomerId() customerId: string,
    @Param('customerNumberId') customerNumberId: string,
  ) {
    return this.routeXml.findDid(customerId, customerNumberId);
  }

  @Post('did/:customerNumberId/rebuild')
  rebuildDid(
    @CustomerId() customerId: string,
    @Param('customerNumberId') customerNumberId: string,
  ) {
    return this.didXml.generate(customerId, customerNumberId);
  }

  @Post('rebuild-dids')
  rebuildDids(@CustomerId() customerId: string) {
    return this.didXml.generateAll(customerId);
  }

  @Post('admin/cleanup-orphans')
  @Roles(Role.SUPER_ADMIN)
  cleanupOrphans() {
    return this.routeXml.cleanupOrphanXmlFiles();
  }

  @Post('admin/rebuild-all-dids')
  @Roles(Role.SUPER_ADMIN)
  rebuildAllDids() {
    return this.didXml.generateAllCustomers();
  }

  @Get(':routeId')
  findOne(@CustomerId() customerId: string, @Param('routeId') routeId: string) {
    return this.routeXml.findOne(customerId, routeId);
  }
}
