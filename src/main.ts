import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 1. Security Headers - prevents common web attacks (XSS, clickjacking, etc.)
  app.use(helmet());

  // 2. Restrict CORS - only allow requests from known frontend origins
  const allowedOrigins = [
    'http://localhost:8100',        // Ionic dev server
    'http://localhost:4200',        // Angular dev server
    'http://qluxiotsystem.com',     // Your production frontend domain (HTTP)
    'https://qluxiotsystem.com',    // Your production frontend domain (HTTPS)
    'https://qconnect-qlux.netlify.app', // Netlify domain
  ];
  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g., mobile apps, Postman, same-server)
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: Origin '${origin}' is not allowed`));
      }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  // 3. Global Input Validation
  app.useGlobalPipes(new ValidationPipe({
    whitelist: false,        // Don't strip fields because the codebase doesn't fully use DTO decorators yet
    forbidNonWhitelisted: false,
    transform: true,
  }));

  await app.listen(process.env.PORT ?? 3000);
  console.log(`Application is running on: ${await app.getUrl()}`);
}
bootstrap();
