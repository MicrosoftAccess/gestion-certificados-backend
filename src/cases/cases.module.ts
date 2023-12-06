import { Module } from '@nestjs/common';
import { CasesService } from './cases.service';
import { CasesController } from './cases.controller';
import { PrismaService } from 'src/prisma/prisma.service';
import { AuthService } from 'src/auth/auth.service';
import { UsersService } from 'src/users/users.service';
import { JwtModule } from '@nestjs/jwt';


@Module({
  controllers: [CasesController],
  providers: [CasesService, PrismaService,AuthService,UsersService],
})
export class CasesModule {}
