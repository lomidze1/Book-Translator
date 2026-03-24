# NestJS Module Scaffolding

ახალი NestJS module-ის სრული scaffolding. ერთი ბრძანებით ქმნის: module, service, controller, DTOs, tests.

## გამოყენება
```
/nest-module <module-name>
```
მაგალითი: `/nest-module books`

## რას ქმნის

$ARGUMENTS არის module-ის სახელი (მაგ: books, translations, payments).

1. წაიკითხე `apps/api/prisma/schema.prisma` — შესაბამისი model-ის fields
2. შექმენი ფაილები:
   - `apps/api/src/$ARGUMENTS/$ARGUMENTS.module.ts`
   - `apps/api/src/$ARGUMENTS/$ARGUMENTS.service.ts`
   - `apps/api/src/$ARGUMENTS/$ARGUMENTS.controller.ts`
   - `apps/api/src/$ARGUMENTS/dto/create-$ARGUMENTS.dto.ts`
   - `apps/api/src/$ARGUMENTS/dto/update-$ARGUMENTS.dto.ts`
   - `apps/api/src/$ARGUMENTS/dto/index.ts`
   - `apps/api/test/$ARGUMENTS/$ARGUMENTS.service.spec.ts`
   - `apps/api/test/$ARGUMENTS/$ARGUMENTS.controller.spec.ts`
3. დაამატე module AppModule-ის imports-ში (`apps/api/src/app.module.ts`)
4. გაუშვი ტესტები: `cd apps/api && npx vitest run`
5. დარწმუნდი ყველა ტესტი გადის

## მნიშვნელოვანი:
- DTOs-ში class-validator decorators სავალდებულოა
- Controller-ზე @UseGuards(JwtAuthGuard)
- Service-ში Prisma calls, არა controller-ში
- ტესტებში vi.fn() mocks, direct instantiation
- ქართული მონაცემები ტესტ fixtures-ში
