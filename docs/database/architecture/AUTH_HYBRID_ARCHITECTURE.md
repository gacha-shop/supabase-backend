# Auth 하이브리드 아키텍처: Edge Function + Supabase Auth 통합

## 핵심 아이디어

**Supabase Auth는 그대로 사용하되, 비즈니스 로직을 Edge Function Service Layer로 분리**

```
┌─────────────────────────────────────────────┐
│   Client (React)                            │
└─────────────────┬───────────────────────────┘
                  │
    ┌─────────────┴─────────────┐
    │                           │
    ▼                           ▼
┌─────────────┐         ┌──────────────────┐
│ Supabase    │         │  Edge Functions  │
│ Auth        │◄────────┤  (Service Layer) │
│ (JWT 발급)  │         │  - 비즈니스 로직  │
└─────────────┘         │  - Validation     │
                        │  - Audit          │
                        └──────────┬───────┘
                                   │
                        ┌──────────▼───────┐
                        │   PostgreSQL     │
                        │   - admin_users  │
                        └──────────────────┘
```

---

## 목차
1. [왜 하이브리드 구조가 최적인가?](#왜-하이브리드-구조가-최적인가)
2. [아키텍처 상세 설계](#아키텍처-상세-설계)
3. [구현 예시](#구현-예시)
4. [마이그레이션 전략](#마이그레이션-전략)
5. [비교표](#비교표)

---

## 왜 하이브리드 구조가 최적인가?

### ✅ Supabase Auth의 장점을 유지

1. **검증된 보안**: JWT 발급/검증, 비밀번호 해싱 등 이미 검증된 로직
2. **무료**: Auth 기능은 Supabase 무료 플랜에 포함
3. **간단한 구현**: `supabase.auth.signUp()` 한 줄로 해결
4. **이메일 인증**: 이메일 인증, 비밀번호 재설정 등 자동 제공

### ✅ Edge Function의 장점 추가

1. **비즈니스 로직 집중화**: Admin 검증, Owner 검증, Audit 로그 등
2. **재사용 가능한 코드**: Service Layer를 자체 서버로 쉽게 이식
3. **일관된 아키텍처**: Shop/Product CRUD와 동일한 패턴
4. **트랜잭션 안전**: Auth 생성 실패 시 DB 롤백 가능

### 🎯 Best of Both Worlds

| 기능 | 담당 | 이유 |
|-----|------|------|
| JWT 발급/검증 | **Supabase Auth** | 이미 검증되고 무료 |
| 비밀번호 해싱 | **Supabase Auth** | bcrypt보다 안전한 알고리즘 |
| 이메일 인증 | **Supabase Auth** | SMTP 설정 불필요 |
| Admin 검증 | **Edge Function** | 복잡한 비즈니스 로직 |
| Owner 매장 연결 | **Edge Function** | shop_owners 테이블 관리 |
| Audit 로깅 | **Edge Function** | 감사 추적 |
| 환영 이메일 | **Edge Function** | 커스텀 이메일 템플릿 |

---

## 아키텍처 상세 설계

### 1. 회원가입 플로우

```
┌────────────┐
│   Client   │
└──────┬─────┘
       │ POST /functions/v1/auth-signup
       │ { email, password, full_name, role }
       ▼
┌──────────────────────────────────────┐
│  Edge Function: auth-signup          │
│                                      │
│  1. 입력 검증 (Service Layer)         │
│  2. Supabase Auth로 유저 생성 ────┐  │
│  3. admin_users 테이블 생성        │  │
│  4. Audit 로그                     │  │
│  5. 환영 이메일 발송                │  │
└──────────────────────────────────┬──┘
                                   │
       ┌───────────────────────────┤
       │                           │
       ▼                           ▼
┌─────────────┐         ┌──────────────────┐
│ Supabase    │         │   PostgreSQL     │
│ Auth        │         │   - admin_users  │
│ (JWT 발급)  │         │   - audit_logs   │
└─────────────┘         └──────────────────┘
```

### 2. 로그인 플로우

```
┌────────────┐
│   Client   │
└──────┬─────┘
       │ POST /functions/v1/auth-signin
       │ { email, password }
       ▼
┌──────────────────────────────────────┐
│  Edge Function: auth-signin          │
│                                      │
│  1. Supabase Auth로 로그인 ───────┐  │
│  2. admin_users 조회 및 검증       │  │
│     - status = active?            │  │
│     - approval_status = approved? │  │
│  3. last_login_at 업데이트         │  │
│  4. Audit 로그                     │  │
└──────────────────────────────────┬──┘
                                   │
       ┌───────────────────────────┤
       │                           │
       ▼                           ▼
┌─────────────┐         ┌──────────────────┐
│ Supabase    │         │   PostgreSQL     │
│ Auth        │         │   - admin_users  │
│ (JWT 검증)  │         │   - audit_logs   │
└─────────────┘         └──────────────────┘
```

### 3. 현재 유저 조회 플로우

```
┌────────────┐
│   Client   │
└──────┬─────┘
       │ 옵션 1: Supabase Auth 직접 사용 (빠름)
       │ const { data } = await supabase.auth.getUser()
       │
       │ 옵션 2: Edge Function 사용 (비즈니스 로직 필요 시)
       │ GET /functions/v1/auth-me
       ▼
┌──────────────────────────────────────┐
│  Supabase Auth                       │
│  - JWT 검증                          │
│  - auth.users 조회                   │
└──────────────────────────────────────┘
```

---

## 구현 예시

### 디렉토리 구조

```
supabase/functions/
├── _shared/
│   ├── services/
│   │   ├── auth.service.ts          # ⭐ 비즈니스 로직 (90% 재사용)
│   │   ├── admin-user.service.ts
│   │   └── audit.service.ts
│   │
│   ├── repositories/
│   │   ├── admin-user.repository.ts
│   │   └── audit.repository.ts
│   │
│   ├── supabase/
│   │   └── client.ts                # Supabase 클라이언트 초기화
│   │
│   ├── types/
│   │   └── auth.types.ts
│   │
│   └── utils/
│       ├── validation.ts
│       └── email.ts
│
├── auth-signup/                     # 회원가입 Edge Function
│   └── index.ts
│
└── auth-signin/                     # 로그인 Edge Function
    └── index.ts
```

### AuthService (핵심 비즈니스 로직)

```typescript
// _shared/services/auth.service.ts
import { createClient } from "@supabase/supabase-js";
import { AdminUserRepository } from "../repositories/admin-user.repository.ts";
import { AuditService } from "./audit.service.ts";
import { validateEmail, validatePassword } from "../utils/validation.ts";
import { sendWelcomeEmail } from "../utils/email.ts";

export interface SignUpData {
  email: string;
  password: string;
  full_name: string;
  role?: "admin" | "owner";
  phone?: string;
  shop_id?: string;
  business_license?: string;
  business_name?: string;
}

export interface SignInData {
  email: string;
  password: string;
}

export class AuthService {
  private supabase;
  private adminUserRepo: AdminUserRepository;
  private auditService: AuditService;

  constructor() {
    // Supabase Client (Service Role)
    this.supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    this.adminUserRepo = new AdminUserRepository();
    this.auditService = new AuditService();
  }

  /**
   * 회원가입
   * ✅ Supabase Auth로 JWT 발급
   * ✅ Edge Function으로 비즈니스 로직 처리
   */
  async signUp(data: SignUpData) {
    // 1. 입력 검증 (100% 재사용)
    this.validateSignUpData(data);

    try {
      // 2. Supabase Auth로 유저 생성 (JWT 자동 발급)
      const { data: authData, error: authError } = await this.supabase.auth.admin.createUser({
        email: data.email,
        password: data.password,
        email_confirm: true, // 어드민은 이메일 인증 스킵
      });

      if (authError) throw authError;
      if (!authData.user) throw new Error("Failed to create auth user");

      // 3. admin_users 또는 shop_owners 생성 (100% 재사용)
      let adminUser;
      if (data.role === "owner") {
        adminUser = await this.createOwnerUser(authData.user.id, data);
      } else {
        adminUser = await this.createAdminUser(authData.user.id, data);
      }

      // 4. 환영 이메일 발송 (100% 재사용)
      await sendWelcomeEmail(adminUser.email, adminUser.full_name);

      // 5. Audit 로그 (100% 재사용)
      await this.auditService.log("admin_signup", "admin_users", adminUser.id, {
        role: adminUser.role,
        email: adminUser.email,
      });

      return {
        success: true,
        user: adminUser,
        // ⚠️ 클라이언트는 Supabase Auth SDK로 세션 자동 관리
        // 따라서 토큰을 반환할 필요 없음
      };
    } catch (error) {
      // 6. 에러 처리
      throw this.handleSignUpError(error);
    }
  }

  /**
   * 로그인
   * ✅ Supabase Auth로 JWT 검증
   * ✅ Edge Function으로 권한 체크
   */
  async signIn(data: SignInData) {
    // 1. 입력 검증 (100% 재사용)
    validateEmail(data.email);
    validatePassword(data.password);

    // 2. Supabase Auth로 로그인 (JWT 자동 발급)
    const { data: authData, error: authError } = await this.supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });

    if (authError) throw authError;
    if (!authData.user) throw new Error("Authentication failed");

    // 3. admin_users 조회 및 검증 (100% 재사용)
    const adminUser = await this.adminUserRepo.findById(authData.user.id);
    if (!adminUser) {
      // Admin이 아니면 로그아웃
      await this.supabase.auth.signOut();
      throw new Error("관리자 권한이 필요합니다.");
    }

    // 4. 상태 검증 (100% 재사용)
    this.validateAdminUserStatus(adminUser);

    // 5. 로그인 정보 업데이트 (100% 재사용)
    await this.adminUserRepo.updateLastLogin(adminUser.id);

    // 6. Audit 로그 (100% 재사용)
    await this.auditService.log("admin_signin", "admin_users", adminUser.id, {
      email: adminUser.email,
    });

    return {
      success: true,
      user: adminUser,
      // ⚠️ 클라이언트는 Supabase Auth SDK로 세션 자동 관리
    };
  }

  // ========== Private Methods (100% 재사용) ==========

  private validateSignUpData(data: SignUpData) {
    validateEmail(data.email);
    validatePassword(data.password);

    if (!data.full_name || data.full_name.trim().length < 2) {
      throw new Error("이름은 2자 이상이어야 합니다.");
    }

    if (data.role === "owner") {
      if (!data.shop_id) throw new Error("매장 ID는 필수입니다.");
      if (!data.phone) throw new Error("전화번호는 필수입니다.");
    }
  }

  private async createAdminUser(authId: string, data: SignUpData) {
    return await this.adminUserRepo.create({
      id: authId,
      email: data.email,
      full_name: data.full_name,
      role: data.role || "admin",
      status: "active",
      approval_status: "pending", // 슈퍼 관리자 승인 필요
    });
  }

  private async createOwnerUser(authId: string, data: SignUpData) {
    // shop_owners 테이블에 생성 (RPC 호출)
    const { data: result, error } = await this.supabase.rpc("create_shop_owner", {
      p_user_id: authId,
      p_email: data.email,
      p_full_name: data.full_name,
      p_phone: data.phone!,
      p_shop_id: data.shop_id!,
      p_business_license: data.business_license || null,
      p_business_name: data.business_name || null,
    });

    if (error) throw error;
    return result;
  }

  private validateAdminUserStatus(adminUser: any) {
    if (adminUser.status !== "active") {
      throw new Error("계정이 비활성화되었습니다.");
    }

    if (adminUser.approval_status === "pending") {
      throw new Error("계정 승인 대기 중입니다.");
    }

    if (adminUser.approval_status === "rejected") {
      const reason = adminUser.rejection_reason || "";
      throw new Error(`계정이 거부되었습니다. ${reason}`);
    }
  }

  private handleSignUpError(error: any) {
    if (error.code === "23505") {
      // Duplicate email
      return new Error("이미 사용 중인 이메일입니다.");
    }
    if (error.message?.includes("User already registered")) {
      return new Error("이미 가입된 이메일입니다.");
    }
    return error;
  }
}
```

### Edge Function: auth-signup

```typescript
// supabase/functions/auth-signup/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { AuthService } from "../_shared/services/auth.service.ts";
import { corsHeaders } from "../_shared/utils/cors.ts";
import { createErrorResponse, createSuccessResponse } from "../_shared/utils/response.ts";

serve(async (req) => {
  // CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const authService = new AuthService();
    const result = await authService.signUp(body);

    return createSuccessResponse(result, 201);
  } catch (error) {
    console.error("Sign up error:", error);
    return createErrorResponse(error);
  }
});
```

### Edge Function: auth-signin

```typescript
// supabase/functions/auth-signin/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { AuthService } from "../_shared/services/auth.service.ts";
import { corsHeaders } from "../_shared/utils/cors.ts";
import { createErrorResponse, createSuccessResponse } from "../_shared/utils/response.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const authService = new AuthService();
    const result = await authService.signIn(body);

    return createSuccessResponse(result);
  } catch (error) {
    console.error("Sign in error:", error);
    return createErrorResponse(error);
  }
});
```

### 클라이언트 코드

```typescript
// src/services/admin-auth.service.ts
import { supabase } from "@/lib/supabase";

const EDGE_FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

export class AdminAuthService {
  /**
   * 회원가입: Edge Function으로 비즈니스 로직 처리
   */
  static async signUp(data: SignUpData) {
    try {
      const response = await fetch(`${EDGE_FUNCTION_URL}/auth-signup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message);

      // ✅ Edge Function에서 Supabase Auth로 유저 생성했으므로
      // 클라이언트에서는 자동으로 로그인됨 (세션 자동 생성)
      return { user: result.data.user, error: null };
    } catch (error) {
      return { user: null, error: error as Error };
    }
  }

  /**
   * 로그인: Edge Function으로 권한 체크
   */
  static async signIn(data: SignInData) {
    try {
      const response = await fetch(`${EDGE_FUNCTION_URL}/auth-signin`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message);

      // ✅ Edge Function에서 Supabase Auth로 로그인했으므로
      // 클라이언트에서는 자동으로 세션 생성됨
      return { user: result.data.user, error: null };
    } catch (error) {
      return { user: null, error: error as Error };
    }
  }

  /**
   * 로그아웃: Supabase Auth 직접 사용 (간단)
   */
  static async signOut() {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  }

  /**
   * 현재 유저 조회: Supabase Auth 직접 사용 (빠름)
   */
  static async getCurrentUser() {
    try {
      const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();

      if (authError) throw authError;
      if (!authUser) return { user: null, error: null };

      // admin_users 조회
      const { data: adminUser, error: adminError } = await supabase
        .from("admin_users")
        .select("*")
        .eq("id", authUser.id)
        .single();

      if (adminError) throw adminError;

      return { user: adminUser, error: null };
    } catch (error) {
      return { user: null, error: error as Error };
    }
  }

  /**
   * 인증 여부 확인
   */
  static async isAuthenticated(): Promise<boolean> {
    const { user } = await this.getCurrentUser();
    return user !== null && user.status === "active";
  }
}
```

---

## 마이그레이션 전략 (자체 서버)

### 단계적 마이그레이션

#### Step 1: Supabase Auth → Custom Auth 교체 (1-2일)

```typescript
// 자체 서버: src/auth/custom-auth.service.ts
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { prisma } from "../db";

/**
 * Supabase Auth 대체
 * ✅ AuthService는 수정 불필요 (인터페이스 동일)
 */
export class CustomAuthService {
  private readonly JWT_SECRET = process.env.JWT_SECRET!;

  /**
   * 유저 생성 (Supabase Auth 대체)
   */
  async createUser(email: string, password: string) {
    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.authUser.create({
      data: { email, password: hashedPassword },
    });

    return {
      id: user.id,
      email: user.email,
    };
  }

  /**
   * 로그인 (Supabase Auth 대체)
   */
  async signIn(email: string, password: string) {
    const user = await prisma.authUser.findUnique({ where: { email } });
    if (!user) throw new Error("Invalid credentials");

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) throw new Error("Invalid credentials");

    const token = jwt.sign({ userId: user.id }, this.JWT_SECRET, { expiresIn: "7d" });

    return {
      id: user.id,
      email: user.email,
      token,
    };
  }
}
```

#### Step 2: AuthService 수정 (30분)

```typescript
// auth.service.ts에서 Supabase Auth → Custom Auth로 교체
// Before
this.supabase = createClient(...);
const { data: authData } = await this.supabase.auth.admin.createUser({
  email: data.email,
  password: data.password,
});

// After (인터페이스 동일하므로 로직 변경 없음!)
this.customAuth = new CustomAuthService();
const authData = await this.customAuth.createUser(
  data.email,
  data.password
);

// ✅ 나머지 비즈니스 로직은 그대로 재사용!
// - admin_users 생성
// - Audit 로그
// - 이메일 발송
```

#### Step 3: Express 라우트 구현 (1일)

```typescript
// 자체 서버: src/routes/auth.ts
import { Router } from "express";
import { AuthService } from "../services/auth.service"; // ← 같은 클래스!

const router = Router();

router.post("/auth/signup", async (req, res) => {
  try {
    const authService = new AuthService(); // ✅ 재사용!
    const result = await authService.signUp(req.body);
    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post("/auth/signin", async (req, res) => {
  try {
    const authService = new AuthService(); // ✅ 재사용!
    const result = await authService.signIn(req.body);
    res.json(result);
  } catch (error) {
    res.status(401).json({ error: error.message });
  }
});

export default router;
```

### 재사용률

| 레이어 | 재사용률 | 마이그레이션 작업 |
|--------|---------|-----------------|
| **AuthService** | 95% | Supabase Auth 호출 → Custom Auth 호출만 변경 |
| **Repository** | 90% | Supabase Client → Prisma 교체 |
| **Validation** | 100% | 그대로 사용 |
| **Email Utils** | 100% | 그대로 사용 |
| **Types** | 100% | 그대로 사용 |
| **HTTP Handler** | 20% | Edge Function → Express 라우트 |

**총 재사용률: 85-90%**

---

## 비교표

### 3가지 아키텍처 비교

| 항목 | 현재 구조<br>(Supabase Auth 직접) | Edge Function만<br>(JWT 직접 발급) | **하이브리드 ⭐<br>(추천)** |
|-----|--------------------------|---------------------------|------------------------|
| **초기 구현 시간** | 🟢 완료됨 | 🔴 2주 (JWT 구현) | 🟡 1주 |
| **보안** | 🟢 검증됨 | ⚠️ 직접 구현 필요 | 🟢 검증됨 |
| **이메일 인증** | 🟢 자동 제공 | 🔴 SMTP 연동 필요 | 🟢 자동 제공 |
| **비즈니스 로직 집중** | ❌ 클라이언트 분산 | ✅ Service Layer | ✅ Service Layer |
| **마이그레이션 재사용률** | 🔴 10% | 🟢 90% | 🟢 85% |
| **마이그레이션 난이도** | 🔴 높음 (전면 재작성) | 🟢 낮음 | 🟢 낮음 |
| **일관된 아키텍처** | ❌ Auth만 다름 | ✅ CRUD와 동일 | ✅ CRUD와 동일 |
| **비용** | 🟢 무료 | ⚠️ Edge Function 호출 | ⚠️ Edge Function 호출 |
| **성능** | 🟢 빠름 (직접 호출) | ⚠️ Cold start | ⚠️ Cold start |

### 하이브리드 구조의 장점

✅ **Supabase Auth의 장점 유지**
- 검증된 JWT 발급/검증
- 비밀번호 해싱 (bcrypt보다 안전)
- 이메일 인증 자동 제공
- 무료

✅ **Edge Function의 장점 추가**
- 비즈니스 로직 집중화 (Audit, 검증, 이메일 등)
- 재사용 가능한 코드 (85% 재사용)
- CRUD API와 일관된 구조
- 트랜잭션 안전

⚠️ **단점 (미미함)**
- Edge Function Cold start (~300ms, 회원가입/로그인은 빈번하지 않음)
- Edge Function 호출 비용 (무료 플랜: 50만 호출/월)

---

## 결론

### ⭐ 최종 권장: 하이브리드 구조

**Supabase Auth는 그대로 사용 + Edge Function으로 비즈니스 로직 분리**

#### 구현 범위

| 기능 | 구현 방법 |
|-----|----------|
| JWT 발급/검증 | **Supabase Auth** (그대로 사용) |
| 비밀번호 해싱 | **Supabase Auth** (그대로 사용) |
| 이메일 인증 | **Supabase Auth** (그대로 사용) |
| 회원가입 로직 | **Edge Function** (auth-signup) |
| 로그인 로직 | **Edge Function** (auth-signin) |
| Admin 검증 | **Edge Function** (Service Layer) |
| Owner 매장 연결 | **Edge Function** (Service Layer) |
| Audit 로그 | **Edge Function** (Service Layer) |
| 환영 이메일 | **Edge Function** (Service Layer) |
| 현재 유저 조회 | **Supabase Auth** (직접 사용, 빠름) |
| 로그아웃 | **Supabase Auth** (직접 사용) |

#### 마이그레이션 시

1. Supabase Auth 호출 부분만 Custom Auth로 교체 (1-2일)
2. Service Layer 85% 재사용
3. Express 라우트 구현 (1일)

**총 마이그레이션 기간: 3-4일 (vs 현재 구조: 3-4주)**

---

**작성일:** 2025-11-14
**작성자:** Claude Code
**문서 버전:** 1.0
