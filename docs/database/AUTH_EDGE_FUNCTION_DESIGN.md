# Auth Edge Function 설계 (자체 서버 마이그레이션 대비)

## 목차
1. [마이그레이션 난이도 비교](#마이그레이션-난이도-비교)
2. [Edge Function 기반 Auth 구조](#edge-function-기반-auth-구조)
3. [구현 계획](#구현-계획)
4. [마이그레이션 전략](#마이그레이션-전략)

---

## 마이그레이션 난이도 비교

### Option A: 현재 구조 (Supabase Auth 직접 사용)

```typescript
// 클라이언트 (src/services/admin-auth.service.ts)
const { data: authData } = await supabase.auth.signUp({
  email: data.email,
  password: data.password,
});
```

**자체 서버 마이그레이션 시:**
```typescript
// ❌ 완전히 새로 작성해야 함
app.post('/api/auth/signup', async (req, res) => {
  const { email, password } = req.body;

  // 1. 비밀번호 해싱 (새로 구현)
  const hashedPassword = await bcrypt.hash(password, 10);

  // 2. DB에 저장 (새로 구현)
  const user = await prisma.user.create({
    data: { email, password: hashedPassword }
  });

  // 3. JWT 발급 (새로 구현)
  const token = jwt.sign({ userId: user.id }, SECRET);

  res.json({ token, user });
});
```

**난이도: 🔴 매우 높음 (재사용률 10%)**

---

### Option B: Edge Function 기반 Auth (권장)

```typescript
// Edge Function (supabase/functions/auth-signup/index.ts)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { AuthService } from "../_shared/services/auth.service.ts";

serve(async (req) => {
  const body = await req.json();
  const authService = new AuthService();
  const result = await authService.signUp(body);
  return Response.json(result);
});
```

```typescript
// Service Layer (_shared/services/auth.service.ts)
export class AuthService {
  async signUp(data: SignUpData) {
    // 1. Supabase Auth로 유저 생성 (마이그레이션 시 교체할 부분)
    const authUser = await this.createAuthUser(data.email, data.password);

    // 2. 비즈니스 로직 (재사용 가능!)
    const adminUser = await this.createAdminUser({
      id: authUser.id,
      email: data.email,
      full_name: data.full_name,
      role: data.role,
    });

    // 3. 추가 로직 (재사용 가능!)
    await this.sendWelcomeEmail(adminUser);
    await this.logAudit('admin_signup', adminUser.id);

    return { user: adminUser, token: authUser.token };
  }

  // 🔄 마이그레이션 시 이 메서드만 교체
  private async createAuthUser(email: string, password: string) {
    // Supabase 버전
    const { data } = await supabase.auth.signUp({ email, password });
    return data.user;

    // 자체 서버 버전 (마이그레이션 시)
    // const hashedPassword = await bcrypt.hash(password, 10);
    // const user = await prisma.user.create({ data: { email, password: hashedPassword } });
    // const token = jwt.sign({ userId: user.id }, SECRET);
    // return { id: user.id, token };
  }
}
```

**자체 서버 마이그레이션 시:**
```typescript
// ✅ Service 코드 90% 재사용!
app.post('/api/auth/signup', async (req, res) => {
  const authService = new AuthService(); // 같은 클래스!
  const result = await authService.signUp(req.body); // 같은 메서드!
  res.json(result);
});
```

**난이도: 🟢 낮음 (재사용률 90%)**

---

## Edge Function 기반 Auth 구조

### 디렉토리 구조

```
supabase/functions/
├── _shared/
│   ├── services/
│   │   ├── auth.service.ts          # ⭐ 핵심 비즈니스 로직 (90% 재사용)
│   │   ├── admin-user.service.ts    # Admin 유저 관리
│   │   └── shop-owner.service.ts    # Owner 관리
│   │
│   ├── repositories/
│   │   ├── admin-user.repository.ts # DB 접근 (80% 재사용)
│   │   └── shop-owner.repository.ts
│   │
│   ├── auth/
│   │   ├── jwt.ts                   # JWT 유틸 (100% 재사용)
│   │   ├── password.ts              # 비밀번호 검증 (100% 재사용)
│   │   └── supabase-auth.ts         # 🔄 Supabase Auth 래퍼 (마이그레이션 시 교체)
│   │
│   ├── types/
│   │   └── auth.types.ts            # 타입 정의 (100% 재사용)
│   │
│   └── utils/
│       ├── email.ts                 # 이메일 발송 (100% 재사용)
│       └── validation.ts            # 입력 검증 (100% 재사용)
│
├── auth-signup/                     # 회원가입
│   └── index.ts
├── auth-signin/                     # 로그인
│   └── index.ts
├── auth-signout/                    # 로그아웃
│   └── index.ts
├── auth-me/                         # 현재 유저 조회
│   └── index.ts
└── auth-refresh/                    # 토큰 갱신
    └── index.ts
```

### 레이어 구조

```
┌─────────────────────────────────────────────┐
│   Edge Function Handler (index.ts)         │  ← 10% 교체
│   - HTTP 요청/응답 처리                      │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│   AuthService (auth.service.ts)            │  ← 90% 재사용
│   - signUp(), signIn(), signOut()          │
│   - 비즈니스 로직, 검증, Audit              │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│   Supabase Auth Wrapper                    │  ← 20% 교체
│   - createAuthUser()                       │
│   - verifyAuthUser()                       │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│   Repository Layer                         │  ← 80% 재사용
│   - AdminUserRepository                    │
└─────────────────────────────────────────────┘
```

---

## 구현 계획

### Phase 1: Auth Service 레이어 구축 (1주)

#### 1.1 공유 모듈 생성

```bash
supabase/functions/_shared/
├── services/auth.service.ts
├── auth/supabase-auth.ts
├── repositories/admin-user.repository.ts
└── types/auth.types.ts
```

#### 1.2 Auth Service 구현

```typescript
// _shared/services/auth.service.ts
import { SupabaseAuth } from "../auth/supabase-auth.ts";
import { AdminUserRepository } from "../repositories/admin-user.repository.ts";
import { validateEmail, validatePassword } from "../utils/validation.ts";
import { sendWelcomeEmail } from "../utils/email.ts";
import { AuditService } from "./audit.service.ts";

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
  private supabaseAuth: SupabaseAuth;
  private adminUserRepo: AdminUserRepository;
  private auditService: AuditService;

  constructor() {
    this.supabaseAuth = new SupabaseAuth();
    this.adminUserRepo = new AdminUserRepository();
    this.auditService = new AuditService();
  }

  /**
   * 회원가입 (Admin/Owner)
   * 마이그레이션 시 90% 재사용 가능
   */
  async signUp(data: SignUpData) {
    // 1. 입력 검증 (100% 재사용)
    this.validateSignUpData(data);

    try {
      // 2. Auth 유저 생성 (🔄 마이그레이션 시 교체)
      const authUser = await this.supabaseAuth.createUser(
        data.email,
        data.password
      );

      // 3. Admin/Owner 유저 생성 (100% 재사용)
      let adminUser;
      if (data.role === "owner") {
        adminUser = await this.createOwnerUser(authUser.id, data);
      } else {
        adminUser = await this.createAdminUser(authUser.id, data);
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
        token: authUser.token,
      };
    } catch (error) {
      // 6. 에러 시 롤백 (100% 재사용)
      throw this.handleSignUpError(error);
    }
  }

  /**
   * 로그인
   * 마이그레이션 시 90% 재사용 가능
   */
  async signIn(data: SignInData) {
    // 1. 입력 검증 (100% 재사용)
    validateEmail(data.email);
    validatePassword(data.password);

    // 2. Auth 검증 (🔄 마이그레이션 시 교체)
    const authUser = await this.supabaseAuth.signIn(
      data.email,
      data.password
    );

    // 3. Admin 유저 조회 및 검증 (100% 재사용)
    const adminUser = await this.adminUserRepo.findById(authUser.id);
    if (!adminUser) {
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
      token: authUser.token,
    };
  }

  /**
   * 로그아웃
   * 마이그레이션 시 100% 재사용
   */
  async signOut(token: string) {
    // 1. 토큰에서 유저 ID 추출 (🔄 마이그레이션 시 교체)
    const userId = await this.supabaseAuth.getUserIdFromToken(token);

    // 2. Audit 로그 (100% 재사용)
    await this.auditService.log("admin_signout", "admin_users", userId, {});

    // 3. 세션 무효화 (🔄 마이그레이션 시 교체)
    await this.supabaseAuth.signOut(token);

    return { success: true };
  }

  /**
   * 현재 유저 조회
   * 마이그레이션 시 90% 재사용
   */
  async getCurrentUser(token: string) {
    // 1. 토큰 검증 (🔄 마이그레이션 시 교체)
    const authUser = await this.supabaseAuth.verifyToken(token);

    // 2. Admin 유저 조회 (100% 재사용)
    const adminUser = await this.adminUserRepo.findById(authUser.id);
    if (!adminUser) {
      throw new Error("유저를 찾을 수 없습니다.");
    }

    // 3. 상태 검증 (100% 재사용)
    this.validateAdminUserStatus(adminUser);

    return {
      success: true,
      user: adminUser,
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
    return await this.adminUserRepo.createOwner({
      user_id: authId,
      email: data.email,
      full_name: data.full_name,
      phone: data.phone!,
      shop_id: data.shop_id!,
      business_license: data.business_license,
      business_name: data.business_name,
    });
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
    return error;
  }
}
```

#### 1.3 Supabase Auth Wrapper (마이그레이션 시 교체할 부분)

```typescript
// _shared/auth/supabase-auth.ts
import { createClient } from "@supabase/supabase-js";

/**
 * Supabase Auth 래퍼
 * 🔄 자체 서버 마이그레이션 시 이 파일만 교체하면 됨
 */
export class SupabaseAuth {
  private supabase;

  constructor() {
    this.supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
  }

  /**
   * 유저 생성
   * 마이그레이션 시 → bcrypt + Prisma로 교체
   */
  async createUser(email: string, password: string) {
    const { data, error } = await this.supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // 이메일 인증 스킵 (어드민이므로)
    });

    if (error) throw error;
    if (!data.user) throw new Error("Failed to create user");

    return {
      id: data.user.id,
      email: data.user.email!,
      token: data.session?.access_token || "",
    };
  }

  /**
   * 로그인
   * 마이그레이션 시 → bcrypt.compare + JWT 발급으로 교체
   */
  async signIn(email: string, password: string) {
    const { data, error } = await this.supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;
    if (!data.user) throw new Error("Authentication failed");

    return {
      id: data.user.id,
      email: data.user.email!,
      token: data.session.access_token,
    };
  }

  /**
   * 토큰 검증
   * 마이그레이션 시 → jwt.verify()로 교체
   */
  async verifyToken(token: string) {
    const { data, error } = await this.supabase.auth.getUser(token);

    if (error) throw error;
    if (!data.user) throw new Error("Invalid token");

    return {
      id: data.user.id,
      email: data.user.email!,
    };
  }

  /**
   * 로그아웃
   * 마이그레이션 시 → Redis에서 토큰 블랙리스트 추가로 교체
   */
  async signOut(token: string) {
    await this.supabase.auth.signOut();
  }

  /**
   * 토큰에서 유저 ID 추출
   */
  async getUserIdFromToken(token: string) {
    const user = await this.verifyToken(token);
    return user.id;
  }
}
```

#### 1.4 Edge Function 핸들러

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
    return createErrorResponse(error);
  }
});
```

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
    return createErrorResponse(error);
  }
});
```

```typescript
// supabase/functions/auth-me/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { AuthService } from "../_shared/services/auth.service.ts";
import { corsHeaders } from "../_shared/utils/cors.ts";
import { createErrorResponse, createSuccessResponse } from "../_shared/utils/response.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const token = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (!token) {
      throw new Error("Missing authorization header");
    }

    const authService = new AuthService();
    const result = await authService.getCurrentUser(token);

    return createSuccessResponse(result);
  } catch (error) {
    return createErrorResponse(error);
  }
});
```

### Phase 2: 클라이언트 통합 (2일)

#### 2.1 클라이언트 서비스 수정

```typescript
// src/services/admin-auth.service.ts (수정)
import { SUPABASE_URL } from "@/lib/supabase";

export class AdminAuthService {
  private static readonly API_BASE = `${SUPABASE_URL}/functions/v1`;

  /**
   * 회원가입
   */
  static async signUp(data: SignUpData) {
    try {
      const response = await fetch(`${this.API_BASE}/auth-signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message);

      return { user: result.data.user, error: null };
    } catch (error) {
      return { user: null, error: error as Error };
    }
  }

  /**
   * 로그인
   */
  static async signIn(data: SignInData) {
    try {
      const response = await fetch(`${this.API_BASE}/auth-signin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message);

      // 토큰 저장
      localStorage.setItem("auth_token", result.data.token);

      return { user: result.data.user, error: null };
    } catch (error) {
      return { user: null, error: error as Error };
    }
  }

  /**
   * 현재 유저 조회
   */
  static async getCurrentUser() {
    try {
      const token = localStorage.getItem("auth_token");
      if (!token) return { user: null, error: null };

      const response = await fetch(`${this.API_BASE}/auth-me`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const result = await response.json();
      if (!response.ok) {
        // 토큰 만료 시 제거
        localStorage.removeItem("auth_token");
        return { user: null, error: null };
      }

      return { user: result.data.user, error: null };
    } catch (error) {
      return { user: null, error: error as Error };
    }
  }

  /**
   * 로그아웃
   */
  static async signOut() {
    try {
      const token = localStorage.getItem("auth_token");
      if (token) {
        await fetch(`${this.API_BASE}/auth-signout`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
      }

      localStorage.removeItem("auth_token");
      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  }
}
```

---

## 마이그레이션 전략

### 자체 서버로 마이그레이션 (향후)

#### Step 1: SupabaseAuth 교체 (1-2일)

```typescript
// 자체 서버: src/auth/custom-auth.ts
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { prisma } from "../db";

/**
 * 🔄 Supabase Auth 대체
 * SupabaseAuth와 동일한 인터페이스 유지
 */
export class CustomAuth {
  private readonly JWT_SECRET = process.env.JWT_SECRET!;
  private readonly JWT_EXPIRES_IN = "7d";

  /**
   * 유저 생성
   * ✅ 인터페이스 동일 → Service Layer 수정 불필요
   */
  async createUser(email: string, password: string) {
    // 비밀번호 해싱
    const hashedPassword = await bcrypt.hash(password, 10);

    // DB에 저장
    const user = await prisma.authUser.create({
      data: {
        email,
        password: hashedPassword,
      },
    });

    // JWT 발급
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      this.JWT_SECRET,
      { expiresIn: this.JWT_EXPIRES_IN }
    );

    return {
      id: user.id,
      email: user.email,
      token,
    };
  }

  /**
   * 로그인
   * ✅ 인터페이스 동일
   */
  async signIn(email: string, password: string) {
    const user = await prisma.authUser.findUnique({
      where: { email },
    });

    if (!user) {
      throw new Error("이메일 또는 비밀번호가 올바르지 않습니다.");
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      throw new Error("이메일 또는 비밀번호가 올바르지 않습니다.");
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      this.JWT_SECRET,
      { expiresIn: this.JWT_EXPIRES_IN }
    );

    return {
      id: user.id,
      email: user.email,
      token,
    };
  }

  /**
   * 토큰 검증
   * ✅ 인터페이스 동일
   */
  async verifyToken(token: string) {
    try {
      const payload = jwt.verify(token, this.JWT_SECRET) as any;
      return {
        id: payload.userId,
        email: payload.email,
      };
    } catch (error) {
      throw new Error("Invalid token");
    }
  }

  /**
   * 로그아웃 (토큰 블랙리스트)
   * ✅ 인터페이스 동일
   */
  async signOut(token: string) {
    // Redis에 토큰 블랙리스트 추가 (옵션)
    // await redis.set(`blacklist:${token}`, "1", "EX", 604800);
  }

  async getUserIdFromToken(token: string) {
    const user = await this.verifyToken(token);
    return user.id;
  }
}
```

```typescript
// auth.service.ts 수정 (단 1줄만 변경!)
// Before
import { SupabaseAuth } from "../auth/supabase-auth.ts";

// After
import { CustomAuth } from "../auth/custom-auth.ts";

export class AuthService {
  private auth: CustomAuth; // ← 타입만 변경

  constructor() {
    this.auth = new CustomAuth(); // ← 인스턴스만 변경
    // 나머지 코드는 전혀 수정 불필요! ✅
  }

  // signUp(), signIn() 등 모든 메서드 그대로 사용 가능!
}
```

#### Step 2: HTTP 핸들러 교체 (1일)

```typescript
// 자체 서버: src/routes/auth.ts
import { Router } from "express";
import { AuthService } from "../services/auth.service"; // ← 같은 클래스!

const router = Router();

// ✅ Service 코드 100% 재사용!
router.post("/auth/signup", async (req, res) => {
  try {
    const authService = new AuthService();
    const result = await authService.signUp(req.body);
    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post("/auth/signin", async (req, res) => {
  try {
    const authService = new AuthService();
    const result = await authService.signIn(req.body);
    res.json(result);
  } catch (error) {
    res.status(401).json({ error: error.message });
  }
});

router.get("/auth/me", async (req, res) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) throw new Error("Missing token");

    const authService = new AuthService();
    const result = await authService.getCurrentUser(token);
    res.json(result);
  } catch (error) {
    res.status(401).json({ error: error.message });
  }
});

export default router;
```

#### Step 3: 클라이언트 URL만 변경 (10분)

```typescript
// src/services/admin-auth.service.ts
// Before
private static readonly API_BASE = `${SUPABASE_URL}/functions/v1`;

// After (환경변수로 관리)
private static readonly API_BASE = process.env.VITE_API_URL; // https://your-server.com/api

// 나머지 코드 전혀 수정 불필요! ✅
```

---

## 재사용률 분석

### 코드 재사용률 (Edge Function 구조 채택 시)

| 레이어 | 재사용률 | 마이그레이션 작업 |
|--------|---------|-----------------|
| **AuthService** | 95% | SupabaseAuth → CustomAuth 교체만 |
| **Repository** | 90% | Supabase Client → Prisma 교체 |
| **Types** | 100% | 그대로 사용 |
| **Utils** | 100% | 그대로 사용 |
| **HTTP Handler** | 10% | Edge Function → Express 라우트 |
| **Auth Wrapper** | 0% | 완전 재작성 (인터페이스는 동일) |

**총 재사용률: 85-90%**

### 비교: 현재 구조 vs Edge Function 구조

| 항목 | 현재 구조 | Edge Function 구조 |
|-----|----------|-------------------|
| 재사용률 | 10% | 85-90% |
| 마이그레이션 기간 | 3-4주 | 1주 |
| 리스크 | 🔴 높음 (전면 재작성) | 🟢 낮음 (점진적 교체) |
| 비즈니스 로직 | 클라이언트에 분산 | Service에 집중 |
| 테스트 용이성 | ❌ 어려움 | ✅ 쉬움 (레이어별) |

---

## 체크리스트

### Phase 1: Edge Function 구축 (1주)

- [ ] `_shared/services/auth.service.ts` 구현
- [ ] `_shared/auth/supabase-auth.ts` 구현
- [ ] `_shared/repositories/admin-user.repository.ts` 구현
- [ ] `_shared/types/auth.types.ts` 정의
- [ ] `_shared/utils/validation.ts` 구현
- [ ] `_shared/utils/email.ts` 구현
- [ ] `auth-signup` Edge Function 생성
- [ ] `auth-signin` Edge Function 생성
- [ ] `auth-signout` Edge Function 생성
- [ ] `auth-me` Edge Function 생성
- [ ] 테스트 (Admin, Owner 회원가입/로그인)

### Phase 2: 클라이언트 통합 (2일)

- [ ] `src/services/admin-auth.service.ts` 수정
- [ ] 토큰 기반 인증으로 전환
- [ ] 기존 페이지 동작 테스트

### 마이그레이션 (향후)

- [ ] CustomAuth 클래스 구현
- [ ] Prisma schema 생성
- [ ] auth.service.ts에서 SupabaseAuth → CustomAuth 교체
- [ ] Express 라우트 구현
- [ ] 클라이언트 API URL 변경
- [ ] 배포 및 전환

---

**작성일:** 2025-11-14
**작성자:** Claude Code
**문서 버전:** 1.0
