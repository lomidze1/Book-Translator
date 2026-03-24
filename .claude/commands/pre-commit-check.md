# Pre-Commit Check

Commit-ის წინ სრული ვალიდაცია: ტესტები, types, lint, security scan.

## გამოყენება
```
/pre-commit-check
```

## რას ამოწმებს (თანმიმდევრობით):

### 1. TypeScript Compilation
```bash
cd apps/api && npx tsc --noEmit
```
თუ ჩავარდა → გამოიტანე errors და შეაჩერე.

### 2. Vitest Tests
```bash
cd apps/api && npx vitest run
```
თუ ჩავარდა → გამოიტანე failing tests და შეაჩერე.

### 3. Prisma Validation
```bash
cd apps/api && npx prisma validate
```
თუ ჩავარდა → schema-ს პრობლემა.

### 4. Security Quick Scan
- `grep -rn "TODO\|FIXME\|HACK\|XXX" apps/api/src --include="*.ts"` — unfinished code
- `.env` ფაილი .gitignore-შია?
- `any` ტიპი ახალ კოდში?

### 5. Git Status Review
```bash
git diff --cached --stat
```
- რა ფაილები იცვლება?
- ხომ არ არის .env ან node_modules staged?
- ხომ არ არის ძალიან დიდი ფაილი (>1MB)?

## შედეგის ფორმატი

```
## ✅ Pre-Commit Check Passed!
- TypeScript: ✅ No errors
- Tests: ✅ 280/280 passed
- Prisma: ✅ Schema valid
- Security: ✅ No issues
- Ready to commit!
```

ან

```
## ❌ Pre-Commit Check Failed!
- TypeScript: ❌ 2 errors in auth.service.ts
- Tests: ✅ 280/280 passed
- Fix errors before committing.
```
