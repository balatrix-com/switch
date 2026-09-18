import { IsBoolean } from 'class-validator';

export class SetDidActivationDto {
  @IsBoolean()
  enabled!: boolean;
}
