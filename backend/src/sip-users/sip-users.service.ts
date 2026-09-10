import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { KamailioDbService } from '../kamailio/kamailio-db.service';
import { XmlCurlCacheService } from '../xml-curl-integration/xml-curl-cache.service';
import { CreateSipUserDto } from './dto/create-sip-user.dto';
import { UpdateSipUserDto } from './dto/update-sip-user.dto';
import { CustomerEntitlementsService } from '../customer-entitlements/customer-entitlements.service';

@Injectable()
export class SipUsersService {
  private readonly realm: string;
  constructor(
    private readonly prisma: PrismaService,
    private readonly kamailio: KamailioDbService,
    private readonly xmlCurlCache: XmlCurlCacheService,
    private readonly entitlements: CustomerEntitlementsService,
    config: ConfigService,
  ) {
    this.realm = config.get<string>('SIP_REALM', 'billing-switch');
  }

  async list(customerId: string) {
    const customer = await this.customer(customerId);
    const users = await this.prisma.sipUser.findMany({
      where: { customerId },
      orderBy: { username: 'asc' },
    });
    const online = await this.kamailio.registeredUsers(
      users.map((user) => user.username),
      this.realm,
    );
    return {
      limit: customer.extensionLimit,
      used: users.length,
      available: Math.max(0, customer.extensionLimit - users.length),
      users: users.map(({ secretHash: _secretHash, ...user }) => ({
        ...user,
        online: online.has(user.username),
      })),
    };
  }

  async status(customerId: string) {
    return this.list(customerId);
  }

  async create(customerId: string, dto: CreateSipUserDto) {
    const customer = await this.customer(customerId);
    const used = await this.prisma.sipUser.count({ where: { customerId } });
    if (used >= customer.extensionLimit)
      throw new BadRequestException(
        `Extension limit reached. This customer can create only ${customer.extensionLimit} extensions.`,
      );
    if (dto.isMonitor) await this.assertMonitorAvailable(customerId);
    const secretHash = this.ha1(dto.username, dto.password);
    let user;
    try {
      user = await this.prisma.sipUser.create({
        data: {
          customerId,
          username: dto.username,
          secretHash,
          sipProfile: dto.sipProfile,
          isActive: dto.isActive,
          isMonitor: dto.isMonitor,
        },
      });
    } catch (error) {
      if (this.isUnique(error))
        throw new ConflictException('SIP username already exists');
      throw error;
    }
    try {
      await this.kamailio.upsertSubscriber({
        username: user.username,
        realm: this.realm,
        ha1: secretHash,
        isActive: user.isActive,
      });
    } catch (error) {
      await this.prisma.sipUser.delete({ where: { id: user.id } });
      throw error;
    }
    await this.xmlCurlCache.flush();
    return this.publicUser(user);
  }

  async update(customerId: string, id: string, dto: UpdateSipUserDto) {
    const current = await this.find(customerId, id);
    if (dto.username && dto.username !== current.username)
      throw new BadRequestException(
        'Reset the password when changing a SIP username',
      );
    if (dto.isMonitor && !current.isMonitor)
      await this.assertMonitorAvailable(customerId, id);
    const user = await this.prisma.sipUser.update({ where: { id }, data: dto });
    await this.kamailio.upsertSubscriber({
      username: user.username,
      realm: this.realm,
      ha1: user.secretHash,
      isActive: user.isActive,
    });
    await this.xmlCurlCache.flush();
    return this.publicUser(user);
  }

  async resetPassword(customerId: string, id: string, password: string) {
    const current = await this.find(customerId, id);
    const secretHash = this.ha1(current.username, password);
    const user = await this.prisma.sipUser.update({
      where: { id },
      data: { secretHash },
    });
    await this.kamailio.upsertSubscriber({
      username: user.username,
      realm: this.realm,
      ha1: secretHash,
      isActive: user.isActive,
    });
    await this.xmlCurlCache.flush();
    return this.publicUser(user);
  }

  async remove(customerId: string, id: string) {
    const user = await this.find(customerId, id);
    await this.kamailio.removeSubscriber(user.username, this.realm);
    await this.prisma.sipUser.delete({ where: { id } });
    await this.xmlCurlCache.flush();
    return { deleted: true };
  }

  private ha1(username: string, password: string) {
    return createHash('md5')
      .update(`${username}:${this.realm}:${password}`)
      .digest('hex');
  }
  private async customer(id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      select: { extensionLimit: true },
    });
    if (!customer) throw new NotFoundException('Customer not found');
    return customer;
  }
  private async find(customerId: string, id: string) {
    const user = await this.prisma.sipUser.findFirst({
      where: { id, customerId },
    });
    if (!user) throw new NotFoundException('SIP user not found');
    return user;
  }
  private publicUser<T extends { secretHash: string }>(user: T) {
    const { secretHash: _secretHash, ...result } = user;
    return result;
  }
  private isUnique(error: unknown) {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'P2002'
    );
  }

  private async assertMonitorAvailable(customerId: string, excludeId?: string) {
    await this.entitlements.assertCanCreateMonitorExtension(customerId);
    const existing = await this.prisma.sipUser.findFirst({
      where: {
        customerId,
        isMonitor: true,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (existing)
      throw new BadRequestException(
        'Only one monitoring extension is allowed per customer',
      );
  }
}
