# 확장 가능한 API 아키텍처 권장안

## 목차
1. [추가 고려사항 분석](#추가-고려사항-분석)
2. [아키텍처 비교](#아키텍처-비교)
3. [최종 권장 아키텍처](#최종-권장-아키텍처)
4. [마이그레이션 전략](#마이그레이션-전략)
5. [구현 가이드](#구현-가이드)

---

## 추가 고려사항 분석

### 1. 일반 유저(general_users)의 Shop API 사용

#### 예상 시나리오

**조회 (READ):**
- 가챠샵 지도에서 매장 목록 조회
- 매장 상세 정보 조회
- 검색, 필터링 (지역, 태그, 시리즈 등)
- 리뷰, 즐겨찾기 조회

**등록 (CREATE):**
- 새로운 가챠샵 제보
- 리뷰 작성
- 즐겨찾기 추가

#### 권한 요구사항

| 작업 | general_users | owner | admin | super_admin |
|------|---------------|-------|-------|-------------|
| 검증된 매장 조회 | ✅ | ✅ | ✅ | ✅ |
| 미검증 매장 조회 | ❌ | 본인만 | ✅ | ✅ |
| 매장 제보 | ✅ (pending) | ❌ | ✅ | ✅ |
| 매장 수정 | ❌ | 본인만 | ✅ | ✅ |
| 매장 삭제 | ❌ | ❌ | ✅ | ✅ |
| 리뷰 작성 | ✅ | ✅ | ✅ | ✅ |
| 리뷰 삭제 | 본인만 | 본인만 | 모두 | 모두 |

**복잡도 증가 요인:**
- 일반 유저가 제보한 매장은 `verification_status='pending'`으로 생성
- 관리자 승인 후 `verification_status='verified'`로 변경
- 제보자는 자신이 제보한 매장을 수정할 수 있어야 함 (승인 전까지)

### 2. 어드민의 많은 CRUD 기능

#### 예상되는 CRUD 엔티티

1. **shops** - 매장 관리
2. **tags** - 태그 관리
3. **general_users** - 일반 유저 관리
4. **admin_users** - 어드민 관리
5. **shop_owners** - 매장 소유권 관리
6. **shop_images** - 매장 이미지 관리
7. **reviews** - 리뷰 관리 (미래)
8. **products** - 가챠 상품 관리 (미래)
9. **series** - 시리즈 관리 (미래)
10. **reports** - 신고 관리 (미래)

#### RLS만으로 관리 시 문제점

**문제 1: RLS 정책 폭발 (Policy Explosion)**
```sql
-- 각 테이블마다 4-6개의 정책 필요
-- 10개 테이블 × 5개 정책 = 50개의 RLS 정책
CREATE POLICY "super_admin_all_access_shops" ...
CREATE POLICY "admin_all_access_shops" ...
CREATE POLICY "owner_read_own_shops" ...
CREATE POLICY "owner_update_own_shops" ...
CREATE POLICY "public_read_verified_shops" ...
CREATE POLICY "general_user_create_pending_shops" ...

-- 각 정책마다 JOIN 발생
EXISTS (SELECT 1 FROM admin_users WHERE ...)
```

**문제 2: 성능 이슈**
- 모든 쿼리에서 RLS 정책 체크 = 서브쿼리 자동 실행
- 복잡한 JOIN이 포함된 정책은 쿼리 성능 저하
- 인덱스 최적화가 어려움

**문제 3: 디버깅 어려움**
- RLS 정책이 많아지면 어떤 정책이 적용되는지 파악 어려움
- 권한 오류 발생 시 원인 추적 어려움
- 테스트 케이스 작성 복잡

**문제 4: 비즈니스 로직 분산**
- 복잡한 검증 로직을 RLS에 넣기 어려움
- 트랜잭션 처리 어려움 (shops + shop_tags + shop_images)
- audit 로깅, 알림 등 부가 기능 추가 어려움

### 3. 자체 서버 마이그레이션 시나리오

#### Supabase → 자체 서버 전환 시

**현재 Supabase 종속성:**
1. **Auth:** `supabase.auth.getUser()`, JWT 검증
2. **Database:** PostgreSQL RLS 정책
3. **Storage:** Supabase Storage API
4. **Edge Functions:** Deno Deploy
5. **Realtime:** WebSocket 구독

**마이그레이션 난이도:**

| 컴포넌트 | RLS 중심 | Edge Function 중심 | 자체 서버 |
|----------|----------|-------------------|----------|
| Auth | 🔴 높음 (RLS 정책 다시 구현) | 🟡 중간 (JWT 검증만) | 🟢 쉬움 |
| Database | 🔴 높음 (RLS → 앱 로직) | 🟡 중간 (일부 변환) | 🟢 쉬움 |
| 비즈니스 로직 | 🔴 높음 (분산됨) | 🟢 쉬움 (집중됨) | 🟢 쉬움 |
| 성능 최적화 | 🔴 어려움 (RLS 제약) | 🟢 쉬움 (직접 제어) | 🟢 쉬움 |

**RLS 중심 아키텍처의 마이그레이션 리스크:**
```typescript
// Supabase RLS (현재)
const { data } = await supabase
  .from('shops')
  .select('*')  // RLS가 자동으로 필터링

// 자체 서버로 마이그레이션 (변환 필요)
app.get('/api/shops', async (req, res) => {
  const user = await verifyToken(req.headers.authorization);

  // RLS 정책을 수동으로 구현해야 함 😱
  let query = db.shops;

  if (user.role === 'owner') {
    const ownerships = await db.shop_owners
      .where('owner_id', user.id)
      .where('verified', true);
    query = query.whereIn('id', ownerships.map(o => o.shop_id));
  } else if (user.role === 'public') {
    query = query.where('verification_status', 'verified');
  }
  // ... 각 RLS 정책을 코드로 변환 😱

  const shops = await query;
  res.json(shops);
});
```

---

## 아키텍처 비교

### 옵션 1: RLS 중심 (Pure Supabase)

```
┌─────────────┐
│   Client    │
│  (React)    │
└──────┬──────┘
       │ supabase client
       ↓
┌─────────────────────┐
│  Supabase Auth      │
└─────────┬───────────┘
          │ JWT
          ↓
┌─────────────────────┐
│  PostgreSQL + RLS   │ ← 모든 권한 체크
│  - shops policy     │
│  - tags policy      │
│  - users policy     │
│  ... (50+ policies) │
└─────────────────────┘
```

**장점:**
- Supabase의 강력한 RLS 활용
- 클라이언트에서 직접 DB 접근 (간단)
- 서버리스 (Edge Function 불필요)

**단점:**
- ❌ RLS 정책 폭발 (유지보수 어려움)
- ❌ 성능 이슈 (모든 쿼리에 서브쿼리)
- ❌ 복잡한 비즈니스 로직 구현 어려움
- ❌ 자체 서버 마이그레이션 매우 어려움
- ❌ 디버깅 어려움

### 옵션 2: Edge Function 중심

```
┌─────────────┐
│   Client    │
│  (React)    │
└──────┬──────┘
       │ REST API
       ↓
┌──────────────────────┐
│  Edge Functions      │ ← 권한 체크 + 비즈니스 로직
│  - admin-shops       │
│  - user-shops        │
│  - tags              │
│  ... (function/엔티티)│
└──────────┬───────────┘
           │ Service Role Key
           ↓
┌──────────────────────┐
│  PostgreSQL (No RLS) │
│  or Minimal RLS      │
└──────────────────────┘
```

**장점:**
- ✅ 비즈니스 로직 집중화 (한 곳에서 관리)
- ✅ 권한 체크 명확 (코드로 표현)
- ✅ 트랜잭션, audit 로깅 쉬움
- ✅ 자체 서버 마이그레이션 쉬움 (로직 재사용)

**단점:**
- ⚠️ Edge Function 개수 증가 (엔티티당 4-5개)
- ⚠️ Cold start 이슈
- ⚠️ Edge Function 비용 (호출 횟수)

### 옵션 3: 하이브리드 BFF (Backend for Frontend) ⭐ **권장**

```
┌─────────────────────────────────────────┐
│              Client (React)              │
└────────────┬───────────────┬─────────────┘
             │               │
    ┌────────┴──────┐   ┌───┴──────────┐
    │   Admin API   │   │   User API   │
    └────────┬──────┘   └───┬──────────┘
             │              │
    ┌────────┴──────────────┴─────────────┐
    │     API Gateway (Edge Function)      │ ← 단일 진입점
    │  - 라우팅                              │
    │  - 인증/인가                           │
    │  - Rate limiting                     │
    └───────────────┬──────────────────────┘
                    │
    ┌───────────────┴──────────────────────┐
    │      Service Layer (TypeScript)      │ ← 비즈니스 로직
    │  - ShopService                       │
    │  - UserService                       │
    │  - TagService                        │
    │  - AuthService                       │
    └───────────────┬──────────────────────┘
                    │
    ┌───────────────┴──────────────────────┐
    │   Repository Layer (Data Access)     │ ← DB 접근
    │  - ShopRepository                    │
    │  - UserRepository                    │
    └───────────────┬──────────────────────┘
                    │ Service Role Key
                    ↓
    ┌────────────────────────────────────┐
    │    PostgreSQL (Minimal RLS)        │
    │  - 최소한의 안전장치만 유지           │
    └────────────────────────────────────┘
```

**장점:**
- ✅ 확장 가능한 구조 (레이어 분리)
- ✅ 비즈니스 로직 재사용 (자체 서버로 쉽게 이식)
- ✅ 테스트 용이 (각 레이어 독립 테스트)
- ✅ Edge Function 최소화 (API Gateway 1개 + 몇 개 서비스)
- ✅ RLS는 최후의 안전장치로만 사용
- ✅ 성능 최적화 가능 (캐싱, 배치 처리 등)

**단점:**
- ⚠️ 초기 구조 설계 필요
- ⚠️ 코드량 증가 (레이어별 파일)

---

## 최종 권장 아키텍처

### ⭐ BFF (Backend for Frontend) 패턴

#### 핵심 원칙

1. **Single Entry Point:** 모든 API 요청은 하나의 Edge Function을 통과
2. **Layered Architecture:** Gateway → Service → Repository 계층 분리
3. **Explicit Authorization:** 코드로 명시적인 권한 체크
4. **Minimal RLS:** 데이터 유출 방지를 위한 최소한의 안전장치만 유지

#### 디렉토리 구조

```
supabase/
└── functions/
    ├── _shared/           # 공유 코드
    │   ├── auth/
    │   │   ├── auth.middleware.ts      # JWT 검증, 유저 정보 추출
    │   │   └── permissions.ts          # 권한 체크 유틸
    │   ├── services/
    │   │   ├── shop.service.ts         # Shop 비즈니스 로직
    │   │   ├── user.service.ts         # User 비즈니스 로직
    │   │   ├── tag.service.ts          # Tag 비즈니스 로직
    │   │   └── auth.service.ts         # Auth 비즈니스 로직
    │   ├── repositories/
    │   │   ├── shop.repository.ts      # Shop DB 접근
    │   │   ├── user.repository.ts      # User DB 접근
    │   │   └── tag.repository.ts       # Tag DB 접근
    │   ├── types/
    │   │   ├── shop.types.ts
    │   │   ├── user.types.ts
    │   │   └── common.types.ts
    │   └── utils/
    │       ├── response.ts             # 통일된 API 응답
    │       ├── errors.ts               # 에러 핸들링
    │       └── validation.ts           # 입력 검증
    │
    ├── api/                # API Gateway (단일 엔드포인트)
    │   └── index.ts        # 라우팅, 인증, Rate limiting
    │
    └── webhooks/           # 외부 서비스 연동 (optional)
        └── stripe/
            └── index.ts
```

#### 레이어별 역할

**1. API Gateway Layer (`functions/api/index.ts`)**
```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { authMiddleware } from "../_shared/auth/auth.middleware.ts";
import { ShopService } from "../_shared/services/shop.service.ts";
import { UserService } from "../_shared/services/user.service.ts";
import { errorResponse, successResponse } from "../_shared/utils/response.ts";

serve(async (req) => {
  // CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 인증 미들웨어
    const { user, error: authError } = await authMiddleware(req);
    if (authError) {
      return errorResponse(authError, 401);
    }

    // URL 파싱
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;

    // 라우팅
    // Admin API
    if (path.startsWith("/api/admin/shops")) {
      return await handleAdminShops(req, user, path, method);
    }

    // User API
    if (path.startsWith("/api/user/shops")) {
      return await handleUserShops(req, user, path, method);
    }

    // Owner API
    if (path.startsWith("/api/owner/shops")) {
      return await handleOwnerShops(req, user, path, method);
    }

    return errorResponse({ message: "Not Found" }, 404);

  } catch (error) {
    return errorResponse(error, 500);
  }
});

// Admin Shops Handler
async function handleAdminShops(req, user, path, method) {
  // 권한 체크
  if (!["super_admin", "admin"].includes(user.role)) {
    return errorResponse({ message: "Forbidden" }, 403);
  }

  const shopService = new ShopService(user);

  // POST /api/admin/shops - 매장 생성
  if (method === "POST" && path === "/api/admin/shops") {
    const body = await req.json();
    const result = await shopService.createShop(body);
    return successResponse(result, 201);
  }

  // GET /api/admin/shops - 매장 목록
  if (method === "GET" && path === "/api/admin/shops") {
    const params = Object.fromEntries(url.searchParams);
    const result = await shopService.listShops(params);
    return successResponse(result);
  }

  // GET /api/admin/shops/:id - 매장 상세
  if (method === "GET" && path.match(/^\/api\/admin\/shops\/[^/]+$/)) {
    const shopId = path.split("/").pop();
    const result = await shopService.getShop(shopId);
    return successResponse(result);
  }

  // PUT /api/admin/shops/:id - 매장 수정
  if (method === "PUT" && path.match(/^\/api\/admin\/shops\/[^/]+$/)) {
    const shopId = path.split("/").pop();
    const body = await req.json();
    const result = await shopService.updateShop(shopId, body);
    return successResponse(result);
  }

  // DELETE /api/admin/shops/:id - 매장 삭제
  if (method === "DELETE" && path.match(/^\/api\/admin\/shops\/[^/]+$/)) {
    const shopId = path.split("/").pop();
    const result = await shopService.deleteShop(shopId);
    return successResponse(result);
  }

  return errorResponse({ message: "Not Found" }, 404);
}

// User Shops Handler
async function handleUserShops(req, user, path, method) {
  const shopService = new ShopService(user);

  // GET /api/user/shops - 검증된 매장 목록 (public)
  if (method === "GET" && path === "/api/user/shops") {
    const params = Object.fromEntries(url.searchParams);
    const result = await shopService.listVerifiedShops(params);
    return successResponse(result);
  }

  // POST /api/user/shops - 매장 제보 (일반 유저)
  if (method === "POST" && path === "/api/user/shops") {
    if (!user || user.role === "owner") {
      return errorResponse({ message: "Forbidden" }, 403);
    }
    const body = await req.json();
    const result = await shopService.submitShop(body);
    return successResponse(result, 201);
  }

  return errorResponse({ message: "Not Found" }, 404);
}

// Owner Shops Handler
async function handleOwnerShops(req, user, path, method) {
  // 권한 체크
  if (user.role !== "owner") {
    return errorResponse({ message: "Forbidden" }, 403);
  }

  const shopService = new ShopService(user);

  // GET /api/owner/shops - 본인 매장 조회
  if (method === "GET" && path === "/api/owner/shops") {
    const result = await shopService.getMyShop();
    return successResponse(result);
  }

  // PUT /api/owner/shops/:id - 본인 매장 수정
  if (method === "PUT" && path.match(/^\/api\/owner\/shops\/[^/]+$/)) {
    const shopId = path.split("/").pop();
    const body = await req.json();
    const result = await shopService.updateMyShop(shopId, body);
    return successResponse(result);
  }

  return errorResponse({ message: "Not Found" }, 404);
}
```

**2. Service Layer (`_shared/services/shop.service.ts`)**
```typescript
import { ShopRepository } from "../repositories/shop.repository.ts";
import { TagRepository } from "../repositories/tag.repository.ts";
import { ShopOwnerRepository } from "../repositories/shop-owner.repository.ts";
import { AuthUser } from "../types/common.types.ts";
import { ShopCreateInput, ShopUpdateInput } from "../types/shop.types.ts";

export class ShopService {
  private shopRepo: ShopRepository;
  private tagRepo: TagRepository;
  private ownerRepo: ShopOwnerRepository;
  private currentUser: AuthUser;

  constructor(currentUser: AuthUser) {
    this.currentUser = currentUser;
    this.shopRepo = new ShopRepository();
    this.tagRepo = new TagRepository();
    this.ownerRepo = new ShopOwnerRepository();
  }

  /**
   * Admin/Super Admin: 매장 생성
   */
  async createShop(input: ShopCreateInput) {
    // 비즈니스 로직 검증
    this.validateShopInput(input);

    // 트랜잭션 시작 (Shop + Tags)
    const shop = await this.shopRepo.create({
      ...input,
      data_source: "admin_input",
      verification_status: "verified",
      created_by: this.currentUser.id,
      updated_by: this.currentUser.id,
    });

    // Tags 연결
    if (input.tag_ids && input.tag_ids.length > 0) {
      await this.tagRepo.attachToShop(shop.id, input.tag_ids, this.currentUser.id);
    }

    // Tags 포함한 Shop 반환
    return this.shopRepo.findByIdWithTags(shop.id);
  }

  /**
   * General User: 매장 제보
   */
  async submitShop(input: ShopCreateInput) {
    // 비즈니스 로직 검증
    this.validateShopInput(input);

    // 제보는 pending 상태로 생성
    const shop = await this.shopRepo.create({
      ...input,
      data_source: "user_submission",
      verification_status: "pending", // 승인 대기
      created_by: this.currentUser.id,
      updated_by: this.currentUser.id,
    });

    // TODO: 관리자에게 알림 발송

    return shop;
  }

  /**
   * Admin: 매장 목록 조회
   */
  async listShops(params: any) {
    // 페이지네이션, 필터링, 정렬
    const { page = 1, limit = 20, search, verification_status, sido } = params;

    return this.shopRepo.findAll({
      page,
      limit,
      search,
      verification_status,
      sido,
    });
  }

  /**
   * Public: 검증된 매장만 조회
   */
  async listVerifiedShops(params: any) {
    const { page = 1, limit = 20, search, sido, tag_ids } = params;

    return this.shopRepo.findVerified({
      page,
      limit,
      search,
      sido,
      tag_ids,
    });
  }

  /**
   * Admin: 매장 수정
   */
  async updateShop(shopId: string, input: ShopUpdateInput) {
    // 존재 확인
    const existingShop = await this.shopRepo.findById(shopId);
    if (!existingShop) {
      throw new Error("Shop not found");
    }

    // 수정
    const updatedShop = await this.shopRepo.update(shopId, {
      ...input,
      updated_by: this.currentUser.id,
    });

    // Tags 업데이트 (있는 경우)
    if (input.tag_ids !== undefined) {
      await this.tagRepo.detachFromShop(shopId);
      if (input.tag_ids.length > 0) {
        await this.tagRepo.attachToShop(shopId, input.tag_ids, this.currentUser.id);
      }
    }

    return this.shopRepo.findByIdWithTags(shopId);
  }

  /**
   * Owner: 본인 매장 조회
   */
  async getMyShop() {
    // shop_owners 테이블에서 본인 소유 매장 찾기
    const ownership = await this.ownerRepo.findByOwnerId(this.currentUser.id);
    if (!ownership || !ownership.verified) {
      throw new Error("No verified shop found");
    }

    return this.shopRepo.findByIdWithTags(ownership.shop_id);
  }

  /**
   * Owner: 본인 매장 수정
   */
  async updateMyShop(shopId: string, input: ShopUpdateInput) {
    // 소유권 검증
    const ownership = await this.ownerRepo.findByOwnerAndShop(
      this.currentUser.id,
      shopId
    );
    if (!ownership || !ownership.verified) {
      throw new Error("Forbidden: Not your shop");
    }

    // Owner가 수정 가능한 필드만 허용
    const allowedFields = [
      "description",
      "phone",
      "business_hours",
      "is_24_hours",
      "gacha_machine_count",
      "detail_address",
      "social_urls",
    ];
    const sanitizedInput = Object.keys(input)
      .filter((key) => allowedFields.includes(key))
      .reduce((obj, key) => {
        obj[key] = input[key];
        return obj;
      }, {});

    return this.shopRepo.update(shopId, {
      ...sanitizedInput,
      updated_by: this.currentUser.id,
    });
  }

  /**
   * Admin: 매장 삭제 (soft delete)
   */
  async deleteShop(shopId: string) {
    const shop = await this.shopRepo.findById(shopId);
    if (!shop) {
      throw new Error("Shop not found");
    }

    return this.shopRepo.softDelete(shopId, this.currentUser.id);
  }

  /**
   * 입력 검증
   */
  private validateShopInput(input: ShopCreateInput) {
    // 필수 필드 체크
    if (!input.name || !input.shop_type || !input.road_address) {
      throw new Error("Missing required fields: name, shop_type, road_address");
    }

    // 좌표 범위 체크
    if (
      input.latitude < -90 ||
      input.latitude > 90 ||
      input.longitude < -180 ||
      input.longitude > 180
    ) {
      throw new Error("Invalid coordinates");
    }

    // 기타 비즈니스 로직 검증...
  }
}
```

**3. Repository Layer (`_shared/repositories/shop.repository.ts`)**
```typescript
import { createClient } from "@supabase/supabase-js";

export class ShopRepository {
  private supabase;

  constructor() {
    // Service Role Key 사용 (RLS 우회)
    this.supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
  }

  async create(data: any) {
    const { data: shop, error } = await this.supabase
      .from("shops")
      .insert(data)
      .select()
      .single();

    if (error) throw error;
    return shop;
  }

  async findById(id: string) {
    const { data, error } = await this.supabase
      .from("shops")
      .select("*")
      .eq("id", id)
      .eq("is_deleted", false)
      .single();

    if (error && error.code !== "PGRST116") throw error; // PGRST116 = not found
    return data;
  }

  async findByIdWithTags(id: string) {
    const { data, error } = await this.supabase
      .from("shops")
      .select(`
        *,
        shop_tags(
          tag_id,
          tags(id, name, description)
        )
      `)
      .eq("id", id)
      .eq("is_deleted", false)
      .single();

    if (error && error.code !== "PGRST116") throw error;
    return data;
  }

  async findAll(params: any) {
    const { page, limit, search, verification_status, sido } = params;
    const offset = (page - 1) * limit;

    let query = this.supabase
      .from("shops")
      .select("*, shop_tags(tag_id, tags(id, name))", { count: "exact" })
      .eq("is_deleted", false);

    // 필터링
    if (search) {
      query = query.or(`name.ilike.%${search}%,road_address.ilike.%${search}%`);
    }
    if (verification_status) {
      query = query.eq("verification_status", verification_status);
    }
    if (sido) {
      query = query.eq("sido", sido);
    }

    // 페이지네이션
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;
    if (error) throw error;

    return {
      data,
      meta: {
        total: count,
        page,
        limit,
        totalPages: Math.ceil(count / limit),
      },
    };
  }

  async findVerified(params: any) {
    const { page, limit, search, sido, tag_ids } = params;
    const offset = (page - 1) * limit;

    let query = this.supabase
      .from("shops")
      .select("*, shop_tags(tag_id, tags(id, name))", { count: "exact" })
      .eq("is_deleted", false)
      .eq("verification_status", "verified"); // 검증된 것만

    // 필터링
    if (search) {
      query = query.or(`name.ilike.%${search}%,road_address.ilike.%${search}%`);
    }
    if (sido) {
      query = query.eq("sido", sido);
    }
    if (tag_ids && tag_ids.length > 0) {
      // Tags로 필터링 (복잡한 쿼리)
      query = query.in(
        "id",
        this.supabase
          .from("shop_tags")
          .select("shop_id")
          .in("tag_id", tag_ids)
      );
    }

    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;
    if (error) throw error;

    return {
      data,
      meta: { total: count, page, limit, totalPages: Math.ceil(count / limit) },
    };
  }

  async update(id: string, data: any) {
    const { data: shop, error } = await this.supabase
      .from("shops")
      .update({
        ...data,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return shop;
  }

  async softDelete(id: string, deletedBy: string) {
    const { data, error } = await this.supabase
      .from("shops")
      .update({
        is_deleted: true,
        deleted_at: new Date().toISOString(),
        updated_by: deletedBy,
      })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }
}
```

**4. Auth Middleware (`_shared/auth/auth.middleware.ts`)**
```typescript
import { createClient } from "@supabase/supabase-js";

export async function authMiddleware(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return { user: null, error: { message: "Missing authorization header" } };
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    {
      global: { headers: { Authorization: authHeader } },
    }
  );

  // JWT 검증 및 유저 정보 가져오기
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return { user: null, error: { message: "Invalid token" } };
  }

  // admin_users 또는 general_users에서 role 가져오기
  let userData = null;

  // admin_users 체크
  const { data: adminUser } = await supabase
    .from("admin_users")
    .select("id, email, role, status, approval_status")
    .eq("id", user.id)
    .single();

  if (adminUser) {
    if (adminUser.status !== "active" || adminUser.approval_status !== "approved") {
      return { user: null, error: { message: "Account not active" } };
    }
    userData = { ...adminUser, user_type: "admin" };
  } else {
    // general_users 체크
    const { data: generalUser } = await supabase
      .from("general_users")
      .select("id, email, nickname, status")
      .eq("id", user.id)
      .single();

    if (generalUser) {
      if (generalUser.status !== "active") {
        return { user: null, error: { message: "Account suspended" } };
      }
      userData = { ...generalUser, role: "user", user_type: "general" };
    }
  }

  if (!userData) {
    return { user: null, error: { message: "User not found" } };
  }

  return { user: userData, error: null };
}
```

---

## 마이그레이션 전략

### Phase 1: Edge Function 버그 수정 (즉시)

**목표:** 현재 동작하지 않는 super_admin 권한 복구

```typescript
// 모든 admin-* edge functions 수정
const ALLOWED_ROLES = ["super_admin", "admin"];
if (!userData || !ALLOWED_ROLES.includes(userData.role)) {
  return errorResponse("Forbidden", 403);
}
```

**소요 시간:** 1-2시간
**영향도:** 낮음 (버그 수정)

### Phase 2: BFF 구조 구축 (단계적)

**Step 1: 공유 코드 구축**
1. `_shared/` 디렉토리 생성
2. Repository, Service, Utils 작성
3. 기존 edge function에서 코드 추출

**Step 2: API Gateway 구축**
1. `functions/api/index.ts` 생성
2. 라우팅 로직 작성
3. 기존 edge function을 service로 변환

**Step 3: 점진적 마이그레이션**
1. 새 기능은 BFF 패턴으로 구현
2. 기존 edge function은 유지 (호환성)
3. 클라이언트에서 새 API로 전환
4. 구 edge function 제거

**소요 시간:** 2-3주
**영향도:** 중간 (점진적 전환으로 리스크 최소화)

### Phase 3: 자체 서버 마이그레이션 준비 (선택)

**BFF 패턴의 코드를 자체 서버로 이식:**

```typescript
// Express.js 예시
import express from "express";
import { ShopService } from "./services/shop.service";
import { authMiddleware } from "./middleware/auth";

const app = express();

// 인증 미들웨어 (JWT 검증만 변경, 로직 동일)
app.use(authMiddleware);

// 기존 Service 코드 그대로 재사용 ✅
app.post("/api/admin/shops", async (req, res) => {
  const shopService = new ShopService(req.user);
  const result = await shopService.createShop(req.body);
  res.json(result);
});

// Repository도 거의 그대로 (Supabase client → Prisma/Knex로만 변경)
```

**이식 용이성:** 90% 이상 코드 재사용 가능

---

## 구현 가이드

### 1. 즉시 적용: Edge Function 버그 수정

```bash
# Edge Functions 수정
cd supabase/functions

# admin-create-shop 수정
# admin-update-shop 수정
# admin-delete-shop 수정
# admin-tags 수정

# 배포
supabase functions deploy admin-create-shop
supabase functions deploy admin-update-shop
supabase functions deploy admin-delete-shop
supabase functions deploy admin-tags
```

### 2. BFF 구조 시작하기

```bash
# 디렉토리 생성
cd supabase/functions
mkdir -p _shared/{auth,services,repositories,types,utils}

# API Gateway 생성
mkdir api
touch api/index.ts

# 공유 코드 작성
touch _shared/services/shop.service.ts
touch _shared/repositories/shop.repository.ts
touch _shared/auth/auth.middleware.ts
```

### 3. 클라이언트 API 호출 변경

```typescript
// Before: 여러 edge functions 호출
const { data } = await supabase.functions.invoke("admin-create-shop", {
  body: shopData,
});

// After: 단일 API Gateway 호출
const response = await fetch(
  `${SUPABASE_URL}/functions/v1/api/admin/shops`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(shopData),
  }
);
const { data } = await response.json();
```

### 4. 최소 RLS 정책 유지 (안전장치)

```sql
-- shops 테이블: 기본 안전장치
CREATE POLICY "service_role_full_access"
ON shops FOR ALL
TO service_role
USING (true);

-- 혹시 Service Role Key가 유출되어도 최소한의 보호
CREATE POLICY "prevent_accidental_deletion"
ON shops FOR DELETE
TO service_role
USING (is_deleted = false);  -- 이미 삭제된 것은 hard delete 방지
```

---

## 결론

### 권장 사항 요약

1. **단기 (즉시):** Edge Function 권한 체크 버그 수정
2. **중기 (2-3주):** BFF 패턴으로 점진적 전환
3. **장기 (필요 시):** 자체 서버 마이그레이션 (코드 재사용 90%+)

### BFF 패턴을 선택하는 이유

| 요구사항 | BFF 패턴 | RLS 중심 | Edge Function 중심 |
|---------|----------|----------|-------------------|
| 일반 유저 API 지원 | ✅ 쉬움 | ⚠️ RLS 폭발 | ✅ 가능 |
| 많은 CRUD 확장성 | ✅ 레이어 분리 | ❌ 유지보수 어려움 | ⚠️ Function 폭발 |
| 자체 서버 마이그레이션 | ✅ 90% 재사용 | ❌ 전면 재작성 | ✅ 80% 재사용 |
| 성능 | ✅ 최적화 가능 | ⚠️ RLS 오버헤드 | ⚠️ Cold start |
| 비즈니스 로직 관리 | ✅ 집중화 | ❌ 분산 | ✅ 집중화 |
| 테스트 용이성 | ✅ 레이어별 독립 | ❌ 어려움 | ⚠️ 중간 |

**최종 판단:** BFF 패턴이 확장성, 유지보수성, 마이그레이션 용이성 측면에서 가장 우수합니다.
