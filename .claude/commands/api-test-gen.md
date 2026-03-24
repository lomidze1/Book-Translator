# API Test Generator

Endpoint-ის ან service-ის მიხედვით ავტომატური ტესტების გენერაცია.

## გამოყენება
```
/api-test-gen <file-path>
```
მაგალითი: `/api-test-gen apps/api/src/books/books.service.ts`

## რას აკეთებს:

1. წაიკითხე $ARGUMENTS ფაილი (service ან controller)
2. გააანალიზე ყოველი public method:
   - Input parameters და ტიპები
   - Return type
   - Throws — რა exceptions
   - Dependencies — რა mocks სჭირდება
3. შექმენი ტესტი `apps/api/test/` -ში შესაბამის საქაღალდეში

## ტესტის სტრუქტურა (ყოველი method-ისთვის):

```typescript
describe('methodName', () => {
  // ✅ Happy path
  it('should successfully do X when valid input', async () => { ... });

  // ❌ Error cases
  it('should throw NotFoundException when entity not found', async () => { ... });
  it('should throw UnauthorizedException when not authenticated', async () => { ... });
  it('should throw BadRequestException when invalid input', async () => { ... });

  // 🔒 Security
  it('should not return sensitive fields (passwordHash)', async () => { ... });
  it('should only allow owner to modify', async () => { ... });

  // 🔀 Edge cases
  it('should handle empty string input', async () => { ... });
  it('should handle Georgian unicode characters', async () => { ... });
  it('should handle null/undefined', async () => { ... });
});
```

## მნიშვნელოვანი:
- Vitest (describe, it, expect, vi, beforeEach)
- Direct instantiation — NestJS DI bypass
- vi.fn() mocks ყველა dependency-სთვის
- vi.clearAllMocks() beforeEach-ში
- ქართული test data: `{ name: 'გიორგი', email: 'test@example.com' }`
- ტესტის შემდეგ: `cd apps/api && npx vitest run` — ყველა გადის?
