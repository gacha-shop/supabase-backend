# Edge Function 중심 아키텍처 + 마이그레이션 전략

## 결정 사항

**방안 2 (Edge Function 중심) 채택 + 향후 자체 서버 마이그레이션 대비**

- 단기: 모든 CRUD를 Edge Function으로 구현
- 장기: 자체 서버 마이그레이션 시 90% 코드 재사용

---

## 1. 현재 상황 분석

### 기존 Edge Functions (버그 있음)

| Function | 역할 | 현재 상태 |
|----------|------|-----------|
| `admin-create-shop` | Shop 생성 + Tags | 🔴 버그 (super_admin 차단) |
| `admin-update-shop` | Shop 수정 + Tags | 🔴 버그 (super_admin 차단) |
| `admin-delete-shop` | Shop 삭제 (soft) | 🔴 버그 (super_admin 차단) |
| `admin-list-shops` | Shop 목록 조회 | 🟡 권한 체크 필요 |
| `admin-get-shop` | Shop 상세 조회 | 🟡 권한 체크 필요 |

### 버그 내용

```typescript
// 현재 코드 (잘못됨)
if (userData?.role !== 'admin') {
  return error('Forbidden');
}

// 수정 필요
const ALLOWED_ROLES = ['super_admin', 'admin'];
if (!ALLOWED_ROLES.includes(userData?.role)) {
  return error('Forbidden');
}
```

---

## 2. 목표 구조

### 2.1 디렉토리 구조

```
supabase/functions/
├── _shared/                          # 공유 모듈 (90% 재사용 가능)
│   ├── auth/
│   │   ├── middleware.ts            # JWT 검증, 권한 체크
│   │   └── permissions.ts           # 역할별 권한 매트릭스
│   │
│   ├── services/                    # ⭐ 비즈니스 로직 (재사용 핵심)
│   │   ├── shop.service.ts          # Shop CRUD 로직
│   │   ├── product.service.ts       # Product CRUD 로직
│   │   ├── user.service.ts          # User 관리
│   │   ├── tag.service.ts           # Tag 관리
│   │   └── image.service.ts         # 이미지 업로드/삭제
│   │
│   ├── repositories/                # ⭐ DB 접근 레이어 (재사용 핵심)
│   │   ├── shop.repository.ts
│   │   ├── product.repository.ts
│   │   ├── tag.repository.ts
│   │   └── base.repository.ts
│   │
│   ├── types/                       # TypeScript 타입 정의
│   │   ├── shop.types.ts
│   │   ├── product.types.ts
│   │   ├── user.types.ts
│   │   └── api.types.ts
│   │
│   ├── utils/
│   │   ├── validation.ts            # 입력 검증
│   │   ├── errors.ts                # 에러 처리
│   │   └── response.ts              # 응답 포맷팅
│   │
│   └── db.ts                        # Supabase 클라이언트 (마이그레이션 시 교체)
│
├── admin-shops-create/              # Admin: Shop 생성
│   └── index.ts
├── admin-shops-update/              # Admin: Shop 수정
│   └── index.ts
├── admin-shops-delete/              # Admin: Shop 삭제 (soft)
│   └── index.ts
├── admin-shops-list/                # Admin: Shop 목록 (필터, 페이징)
│   └── index.ts
├── admin-shops-get/                 # Admin: Shop 상세
│   └── index.ts
│
├── owner-shops-get/                 # Owner: 본인 매장 조회
│   └── index.ts
├── owner-shops-update/              # Owner: 본인 매장 수정
│   └── index.ts
│
├── public-shops-list/               # Public: 검증된 매장 목록
│   └── index.ts
├── public-shops-get/                # Public: 매장 상세
│   └── index.ts
│
├── general-shops-submit/            # General User: 매장 제보
│   └── index.ts
│
├── admin-products-*                 # Product CRUD (5개)
├── admin-tags-*                     # Tag CRUD (5개)
└── ...                              # 추가 엔티티들
```

### 2.2 레이어 구조

```
┌─────────────────────────────────────────────┐
│   Edge Function Handler (index.ts)         │  ← HTTP 요청/응답 처리 (마이그레이션 시 교체)
│   - CORS, 파싱, 에러 변환                   │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│   Auth Middleware                           │  ← JWT 검증, 권한 체크 (부분 교체)
│   - authenticate(req)                       │
│   - requireRole(['admin', 'super_admin'])   │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│   Service Layer (shop.service.ts)          │  ← ⭐ 비즈니스 로직 (100% 재사용!)
│   - createShop(), updateShop(), ...        │
│   - 권한 체크, 유효성 검사, 트랜잭션       │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│   Repository Layer (shop.repository.ts)    │  ← ⭐ DB 접근 (90% 재사용!)
│   - insert(), update(), delete(), ...      │
│   - SQL 쿼리, 관계 처리                     │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│   Database (Supabase PostgreSQL)           │  ← 마이그레이션 시 교체
└─────────────────────────────────────────────┘
```

---

## 3. 구현 단계

### Phase 1: 버그 수정 및 구조 정리 (1주)

**목표:** 기존 Edge Functions 버그 수정 + 공유 모듈 구조화

#### 1.1 공유 모듈 생성

```bash
supabase/functions/_shared/
├── auth/middleware.ts
├── services/shop.service.ts
├── types/shop.types.ts
└── utils/errors.ts
```

**작업 내용:**
- [X] Auth middleware 생성 (JWT 검증, 권한 체크)
- [ ] Shop service 생성 (비즈니스 로직 분리)
- [ ] Type 정의 (ShopCreateInput, ShopUpdateInput 등)
- [ ] Error handling 유틸리티

#### 1.2 기존 Edge Functions 리팩토링

```typescript
// Before (admin-create-shop/index.ts)
serve(async (req) => {
  const token = req.headers.get('Authorization');
  const { data: { user } } = await supabase.auth.getUser(token);
  const { data: userData } = await supabase.from('admin_users')...

  if (userData?.role !== 'admin') { // 🔴 버그!
    return error('Forbidden');
  }

  const { data: shop } = await supabase.from('shops').insert(...)
  // ... 복잡한 로직
});

// After
import { authenticate } from '../_shared/auth/middleware.ts';
import { ShopService } from '../_shared/services/shop.service.ts';

serve(async (req) => {
  try {
    const user = await authenticate(req); // ✅ 인증
    const body = await req.json();

    const service = new ShopService(user); // ✅ 서비스 레이어
    const shop = await service.createShop(body); // ✅ 비즈니스 로직

    return Response.json({ success: true, data: shop });
  } catch (error) {
    return createErrorResponse(error);
  }
});
```

**작업 내용:**
- [ ] `admin-create-shop` 리팩토링
- [ ] `admin-update-shop` 리팩토링
- [ ] `admin-delete-shop` 리팩토링
- [ ] `admin-list-shops` 리팩토링
- [ ] `admin-get-shop` 리팩토링

#### 1.3 테스트

- [ ] Admin 권한으로 Shop CRUD 테스트
- [ ] Super Admin 권한으로 Shop CRUD 테스트 (버그 수정 확인)
- [ ] Owner 권한으로 본인 매장 수정 테스트
- [ ] General User 권한으로 매장 제보 테스트

---

### Phase 2: 새 엔티티 추가 (2-3주)

**목표:** Owner, Product, Tag 등 추가 엔티티를 Edge Function으로 구현

#### 2.1 Owner (본인 매장 관리)

```
owner-shops-get/          # 본인 매장 조회
owner-shops-update/       # 본인 매장 수정 (제한된 필드)
```

**작업 내용:**
- [ ] OwnerShopService 생성
- [ ] 소유권 검증 로직 (shop_owners 테이블)
- [ ] Owner가 수정 가능한 필드 제한 (description, phone, business_hours 등)
- [ ] Edge Functions 2개 생성

#### 2.2 Product CRUD

```
admin-products-create/
admin-products-update/
admin-products-delete/
admin-products-list/
admin-products-get/
```

**작업 내용:**
- [ ] ProductService 생성
- [ ] Product 관련 비즈니스 로직 (재고 관리, 가격 검증 등)
- [ ] Edge Functions 5개 생성

#### 2.3 Tag CRUD

```
admin-tags-create/
admin-tags-update/
admin-tags-delete/
admin-tags-list/
admin-tags-get/
```

**작업 내용:**
- [ ] TagService 생성
- [ ] Tag 중복 검증, shop_tags 관계 관리
- [ ] Edge Functions 5개 생성

#### 2.4 General User (매장 제보)

```
general-shops-submit/     # 매장 제보 (pending 상태)
general-shops-list/       # 본인 제보 목록
```

**작업 내용:**
- [ ] GeneralUserService 생성
- [ ] 제보 검증 로직 (중복 제보 방지)
- [ ] Edge Functions 2개 생성

---

### Phase 3: 이미지 및 고급 기능 (1주)

#### 3.1 이미지 업로드/삭제

```
upload-shop-images/       # 여러 이미지 업로드 + DB 저장
delete-shop-image/        # 이미지 삭제 (Storage + DB)
update-shop-image-order/  # 이미지 순서 변경
```

**작업 내용:**
- [ ] ImageService 생성 (Storage 처리)
- [ ] shop_images 테이블 CRUD
- [ ] Edge Functions 3개 생성

#### 3.2 Audit 로깅

```typescript
// _shared/services/audit.service.ts
export class AuditService {
  async log(action: string, entityType: string, entityId: string, changes: any) {
    await supabase.from('audit_logs').insert({
      user_id: this.currentUser.id,
      action,
      entity_type: entityType,
      entity_id: entityId,
      changes,
      created_at: new Date().toISOString(),
    });
  }
}
```

**작업 내용:**
- [ ] audit_logs 테이블 생성
- [ ] AuditService 구현
- [ ] 주요 CUD 작업에 로깅 추가

---

## 4. 마이그레이션 전략 (자체 서버)

### 4.1 마이그레이션이 필요한 시점

다음 중 하나라도 해당하면 마이그레이션 고려:

1. **비용:** Supabase Edge Functions 비용이 월 $100 이상
2. **성능:** Cold start 이슈가 사용자 경험에 영향
3. **제약:** Supabase의 제약 (실행 시간, 메모리 등)이 문제
4. **요구사항:** WebSocket, 실시간 처리, 복잡한 배치 작업 필요

### 4.2 마이그레이션 절차

#### Step 1: 자체 서버 구축 (1-2주)

**기술 스택 선택:**
```typescript
// 옵션 1: Express.js (가장 일반적)
// 옵션 2: Fastify (고성능)
// 옵션 3: Nest.js (엔터프라이즈급)

// 추천: Express.js (간단, 레퍼런스 많음)
```

**프로젝트 구조:**
```
backend/
├── src/
│   ├── routes/              # API 라우트 (교체 필요)
│   │   ├── admin/
│   │   │   └── shops.ts
│   │   ├── owner/
│   │   └── public/
│   │
│   ├── middleware/          # 미들웨어 (부분 교체)
│   │   ├── auth.ts          # JWT 검증 (Supabase → 직접 구현)
│   │   └── errors.ts
│   │
│   ├── services/            # ⭐ 비즈니스 로직 (100% 재사용!)
│   │   ├── shop.service.ts  # Edge Function에서 복사
│   │   ├── product.service.ts
│   │   └── ...
│   │
│   ├── repositories/        # ⭐ DB 접근 (90% 재사용!)
│   │   ├── shop.repository.ts
│   │   └── ...
│   │
│   ├── types/               # ⭐ 타입 정의 (100% 재사용!)
│   │   └── ...
│   │
│   ├── utils/               # ⭐ 유틸리티 (100% 재사용!)
│   │   └── ...
│   │
│   └── db.ts                # DB 클라이언트 (교체 필요)
│
├── prisma/                  # Prisma ORM (또는 TypeORM)
│   └── schema.prisma
└── package.json
```

#### Step 2: DB 클라이언트 교체 (1일)

```typescript
// Before: Supabase Client
const { data } = await supabase
  .from('shops')
  .insert({ name: 'Test' })
  .select()
  .single();

// After: Prisma
const data = await prisma.shop.create({
  data: { name: 'Test' },
});
```

**작업 내용:**
- [ ] Prisma schema 생성 (Supabase DB 스키마 복사)
- [ ] Repository 레이어의 Supabase 클라이언트 → Prisma로 교체
- [ ] 테스트

#### Step 3: Auth 미들웨어 교체 (1일)

```typescript
// Before: Supabase Auth
const { data: { user } } = await supabase.auth.getUser(token);

// After: JWT 직접 검증
const payload = jwt.verify(token, process.env.JWT_SECRET);
const user = await prisma.adminUser.findUnique({ where: { id: payload.sub } });
```

**작업 내용:**
- [ ] JWT 라이브러리 설치 (`jsonwebtoken`)
- [ ] Auth middleware 교체
- [ ] 테스트

#### Step 4: HTTP 핸들러 구현 (2-3일)

```typescript
// Before: Edge Function (supabase/functions/admin-shops-create/index.ts)
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

serve(async (req) => {
  const user = await authenticate(req);
  const service = new ShopService(user);
  const shop = await service.createShop(body);
  return Response.json(shop);
});

// After: Express Route (src/routes/admin/shops.ts)
import { Router } from 'express';

const router = Router();

router.post('/admin/shops', authenticate, async (req, res) => {
  const service = new ShopService(req.user); // 똑같은 인터페이스!
  const shop = await service.createShop(req.body);
  res.json(shop);
});
```

**작업 내용:**
- [ ] Express 라우트 구현 (엔티티별)
- [ ] 에러 핸들링 미들웨어
- [ ] CORS 설정
- [ ] 테스트

#### Step 5: 배포 및 전환 (1주)

**배포 옵션:**
- Railway
- Render
- AWS EC2/ECS
- Google Cloud Run
- DigitalOcean App Platform

**전환 절차:**
1. 자체 서버 배포
2. 클라이언트 API URL 변경 (Supabase Edge Function → 자체 서버)
3. 병렬 운영 (1-2주)
4. Supabase Edge Functions 제거

---

## 5. 코드 재사용률 분석

### 재사용 가능 (90-100%)

| 레이어 | 파일 예시 | 재사용률 | 이유 |
|--------|-----------|----------|------|
| **Service Layer** | `shop.service.ts` | 100% | 순수 비즈니스 로직, DB 추상화됨 |
| **Types** | `shop.types.ts` | 100% | TypeScript 타입 정의 |
| **Utils** | `validation.ts` | 100% | 순수 함수 |
| **Repository** | `shop.repository.ts` | 90% | DB 클라이언트만 교체 (Supabase → Prisma) |

### 교체 필요 (10-20%)

| 레이어 | 파일 예시 | 교체 이유 |
|--------|-----------|-----------|
| **HTTP Handler** | `index.ts` (Edge Function) | Deno `serve` → Express `Router` |
| **Auth Middleware** | `middleware.ts` | Supabase Auth → JWT 직접 검증 |
| **DB Client** | `db.ts` | Supabase Client → Prisma/TypeORM |

### 재사용률 요약

```
총 코드베이스: 100%
├── 재사용 가능: 90%
│   ├── Service Layer: 40%
│   ├── Repository Layer: 25%
│   ├── Types: 15%
│   └── Utils: 10%
└── 교체 필요: 10%
    ├── HTTP Handler: 5%
    ├── Auth Middleware: 3%
    └── DB Client: 2%
```

**결론:** 마이그레이션 시 90% 코드 재사용 가능, 10%만 교체

---

## 6. 비용 분석

### Supabase Edge Functions 비용

**무료 플랜:**
- 500K invocations/month (50만 호출)
- 50 CPU hours/month

**Pro 플랜 ($25/month):**
- 2M invocations/month (200만 호출)
- 150 CPU hours/month

**추가 비용:**
- $2 per 1M invocations

**예상 비용 (월간):**

| 사용량 | 비용 |
|--------|------|
| 100K requests | 무료 |
| 500K requests | 무료 |
| 2M requests | $25 (Pro 플랜) |
| 5M requests | $25 + $6 = $31 |
| 10M requests | $25 + $16 = $41 |

### 자체 서버 비용 (참고)

| 옵션 | 사양 | 비용/월 |
|------|------|---------|
| Railway Hobby | 512MB RAM, 1 vCPU | $5 |
| Render Starter | 512MB RAM | $7 |
| DigitalOcean Basic | 1GB RAM, 1 vCPU | $6 |
| AWS t4g.micro | 1GB RAM, 2 vCPU | $6 |

**결론:** 초기 단계에서는 Supabase Edge Functions가 저렴하고 편리

---

## 7. 성능 고려사항

### Edge Function Cold Start

**측정 결과:**
- Cold start: ~300-500ms
- Warm start: ~30-50ms

**완화 방법:**
1. **Warm-up 핑:** 주기적으로 함수 호출 (매 5분)
2. **모듈 최소화:** 불필요한 import 제거
3. **코드 분할:** 거대한 함수 → 작은 함수들로 분할

### DB 쿼리 최적화

```typescript
// Bad: N+1 쿼리 문제
const shops = await supabase.from('shops').select('*');
for (const shop of shops) {
  const tags = await supabase.from('shop_tags').select('*').eq('shop_id', shop.id);
}

// Good: JOIN으로 한 번에 조회
const shops = await supabase
  .from('shops')
  .select(`
    *,
    shop_tags (
      tag_id,
      tags (id, name)
    )
  `);
```

---

## 8. 체크리스트

### Phase 1: 버그 수정 (1주)

- [ ] Auth middleware 구현 (`_shared/auth/middleware.ts`)
- [ ] Shop service 구현 (`_shared/services/shop.service.ts`)
- [ ] Type 정의 (`_shared/types/shop.types.ts`)
- [ ] Error handling 유틸리티 (`_shared/utils/errors.ts`)
- [ ] `admin-create-shop` 리팩토링
- [ ] `admin-update-shop` 리팩토링
- [ ] `admin-delete-shop` 리팩토링
- [ ] `admin-list-shops` 리팩토링
- [ ] `admin-get-shop` 리팩토링
- [ ] Super Admin 권한 테스트
- [ ] Admin 권한 테스트
- [ ] Owner 권한 테스트

### Phase 2: 새 엔티티 (2-3주)

- [ ] Owner shop functions (2개)
- [ ] Product CRUD functions (5개)
- [ ] Tag CRUD functions (5개)
- [ ] General user submit function (2개)
- [ ] 통합 테스트

### Phase 3: 고급 기능 (1주)

- [ ] 이미지 업로드/삭제 functions (3개)
- [ ] Audit logging 구현
- [ ] 성능 최적화

### 마이그레이션 (선택사항, 향후 필요 시)

- [ ] 자체 서버 프로젝트 생성
- [ ] Prisma schema 생성
- [ ] Repository 레이어 교체
- [ ] Auth middleware 교체
- [ ] HTTP 핸들러 구현
- [ ] 배포 및 전환

---

## 9. 참고 자료

- [Supabase Edge Functions 문서](https://supabase.com/docs/guides/functions)
- [Deno Deploy 가이드](https://deno.com/deploy/docs)
- [Express.js 문서](https://expressjs.com/)
- [Prisma ORM 문서](https://www.prisma.io/docs)

---

## 10. Q&A

### Q1: Edge Function이 RLS보다 나은 이유?

**A:**
- **복잡한 로직:** Shop + Tags를 한 번에 처리 (트랜잭션)
- **집중화:** 비즈니스 로직이 한 곳에 있어 유지보수 쉬움
- **마이그레이션:** 자체 서버로 이동 시 90% 재사용 가능
- **Audit:** 로깅, 추적 쉬움

### Q2: Cold start 문제는?

**A:**
- Warm instance 유지로 대부분의 요청은 50ms 이내
- Warm-up 핑으로 cold start 최소화 가능
- 사용자가 느끼기 힘든 수준 (~300ms)

### Q3: 비용이 걱정됩니다.

**A:**
- 초기: 무료 플랜으로 충분 (월 50만 호출)
- 성장 후: Pro $25 + 추가 사용량 (월 $30-50 수준)
- 자체 서버보다 저렴하고 관리 편함

### Q4: 언제 마이그레이션해야 하나요?

**A:**
- 비용이 월 $100 이상
- Cold start가 문제
- WebSocket, 배치 작업 필요
- 그 전까지는 Edge Function 사용 권장

---

**작성일:** 2025-11-13
**작성자:** Claude Code
**문서 버전:** 1.0
