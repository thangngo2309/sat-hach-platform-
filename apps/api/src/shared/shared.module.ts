import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

@Module({
  imports: [
    JwtModule.register({
      global: true,
      signOptions: {
        algorithm: 'HS256',
      },
    }),
  ],
  exports: [JwtModule],
})
@Global()
export class SharedModule {}
