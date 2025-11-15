# 유저 테이블 분리 vs 통합 - 재검토 의사결정

> CEO/CTO 의사결정 문서 (수정본)
> 작성일: 2025-11-12

---

## 🎯 **최종 의사결정: 테이블 분리 권장 ✅**

당신의 지적이 맞습니다. **테이블을 분리**하는 것이 더 나은 선택입니다.

```sql
-- ✅ 권장: 테이블 분리
general_users      -- 일반 유저 (소셜 로그인, 유저 서비스 전용)
admin_users        -- 어드민 + 사장님 (이메일 로그인, 어드민 서비스 전용)
```

---

## 📊 1. 테이블 분리 근거 분석

### **1.1 진화 방향이 완전히 다름**

```
일반 유저 (general_users)
├── Phase 1: 기본 정보 (닉네임, 아바타)
├── Phase 2: 커뮤니티 (좋아요, 팔로우, 컬렉션)
│   ├── favorite_shops (좋아한 상점)
│   ├── user_reviews (작성한 리뷰)
│   ├── user_posts (작성한 게시글)
│   ├── user_collections (뽑은 캐릭터)
│   ├── user_followers (팔로워)
│   └── user_badges (뱃지/업적)
├── Phase 3: 소셜 기능
│   ├── user_friends (친구)
│   ├── user_messages (쪽지)
│   └── user_notifications (알림)
└── Phase 4: 게임화
    ├── user_levels (레벨)
    ├── user_points (포인트)
    └── user_items (아이템)

어드민 유저 (admin_users)
├── Phase 1: 기본 권한 (role)
├── Phase 2: 세밀한 권한 관리
│   ├── admin_permissions (권한)
│   ├── admin_roles (역할)
│   └── admin_audit_logs (감사 로그)
├── Phase 3: 사장님 기능
│   ├── shop_owners (매장 소유)
│   └── owner_business_info (사업자 정보)
└── 관리 메타데이터
    ├── last_login_ip
    ├── login_attempts
    └── mfa_enabled
```

**결론:** 두 테이블은 완전히 다른 Feature Set으로 진화

---

### **1.2 데이터 특성이 다름**

| 비교 항목 | 일반 유저 | 어드민/사장 |
|----------|----------|------------|
| **데이터 성격** | 공개 프로필 | 내부 관리 |
| **레코드 수** | 수만~수십만 | 수십~수백 |
| **읽기 패턴** | 빈번한 조회 (프로필, 리뷰) | 드문 조회 (로그인 시) |
| **쓰기 패턴** | 빈번한 업데이트 (활동) | 드문 업데이트 (권한 변경) |
| **조인 대상** | shops, reviews, posts, collections | permissions, audit_logs |
| **인덱스 전략** | nickname, created_at | role, permissions |
| **보안 요구사항** | RLS (본인만) | RLS + 감사 로그 |
| **캐싱** | 적극적 캐싱 필요 | 캐싱 불필요 |

---

### **1.3 조인 관계 분석**

#### **일반 유저의 관계**

```sql
general_users
  ├── 1:N → reviews (유저가 작성한 리뷰)
  ├── 1:N → posts (유저가 작성한 게시글)
  ├── 1:N → user_collections (유저가 뽑은 캐릭터)
  ├── M:N → shops (좋아요한 상점) via favorite_shops
  ├── M:N → general_users (팔로워) via user_followers
  └── 1:N → notifications (받은 알림)
```

#### **어드민 유저의 관계**

```sql
admin_users
  ├── M:N → permissions via admin_permissions
  ├── 1:N → admin_audit_logs (감사 로그)
  ├── 1:1 → shops (사장님의 경우) via shop_owners
  └── 1:N → shops (created_by, updated_by 메타데이터)
```

**교집합:** 없음! (완전히 분리된 도메인)

---

### **1.4 쿼리 패턴 비교**

#### **일반 유저 서비스의 전형적인 쿼리**

```sql
-- 1. 유저 프로필 + 통계
SELECT 
  u.id,
  u.nickname,
  u.avatar_url,
  COUNT(DISTINCT r.id) AS review_count,
  COUNT(DISTINCT p.id) AS post_count,
  COUNT(DISTINCT c.id) AS collection_count
FROM general_users u
LEFT JOIN reviews r ON u.id = r.user_id
LEFT JOIN posts p ON u.id = p.user_id
LEFT JOIN user_collections c ON u.id = c.user_id
WHERE u.id = ?
GROUP BY u.id;

-- 2. 유저가 좋아한 상점 목록
SELECT s.*
FROM shops s
JOIN favorite_shops fs ON s.id = fs.shop_id
WHERE fs.user_id = ?;

-- 3. 유저의 최근 활동
SELECT * FROM (
  SELECT 'review' AS type, created_at, shop_id FROM reviews WHERE user_id = ?
  UNION ALL
  SELECT 'post' AS type, created_at, NULL FROM posts WHERE user_id = ?
) activities
ORDER BY created_at DESC
LIMIT 20;
```

#### **어드민 서비스의 전형적인 쿼리**

```sql
-- 1. 어드민 권한 확인
SELECT 
  a.id,
  a.email,
  a.role,
  array_agg(p.code) AS permissions
FROM admin_users a
LEFT JOIN admin_permissions ap ON a.id = ap.admin_id
LEFT JOIN permissions p ON ap.permission_id = p.id
WHERE a.id = ?
GROUP BY a.id;

-- 2. 감사 로그
SELECT 
  a.email,
  al.action,
  al.resource,
  al.created_at
FROM admin_audit_logs al
JOIN admin_users a ON al.admin_id = a.id
ORDER BY al.created_at DESC;

-- 3. 사장님 매장 정보
SELECT 
  a.id,
  a.email,
  s.name AS shop_name,
  s.address_full
FROM admin_users a
JOIN shop_owners so ON a.id = so.owner_id
JOIN shops s ON so.shop_id = s.id
WHERE a.id = ?;
```

**결론:** 쿼리 패턴이 완전히 다름. 조인하는 테이블도 다름.

---

### **1.5 성능 영향**

#### **시나리오 1: 통합 테이블의 문제**

```sql
-- users 테이블 (통합)
-- 레코드: 일반 유저 10만 + 어드민 50 = 100,050

-- 일반 유저 프로필 조회 (빈번)
SELECT * FROM users WHERE id = ? AND user_type = 'general';
-- 문제: user_type 조건 때문에 인덱스 효율 감소

-- 어드민 권한 체크 (빈번)
SELECT * FROM users WHERE id = ? AND user_type IN ('admin', 'owner');
-- 문제: 동일한 테이블을 2가지 용도로 사용

-- 통계 쿼리
SELECT user_type, COUNT(*) FROM users GROUP BY user_type;
-- 문제: 10만 건 스캔
```

#### **시나리오 2: 분리 테이블의 이점**

```sql
-- general_users 테이블: 10만 건
-- admin_users 테이블: 50건

-- 일반 유저 프로필 조회
SELECT * FROM general_users WHERE id = ?;
-- ✅ 단순한 PK 조회, 최적화됨

-- 어드민 권한 체크
SELECT * FROM admin_users WHERE id = ?;
-- ✅ 50건만 있으므로 매우 빠름

-- 통계
SELECT 'general' AS type, COUNT(*) FROM general_users
UNION ALL
SELECT 'admin' AS type, COUNT(*) FROM admin_users;
-- ✅ 각 테이블은 독립적으로 최적화
```

---

## 📋 2. 최종 스키마 설계 (분리)

### 2.1 general_users 테이블

```sql
CREATE TABLE general_users (
  -- 기본 정보
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  
  -- 프로필
  nickname TEXT UNIQUE,
  full_name TEXT,
  avatar_url TEXT,
  bio TEXT,  -- 자기소개
  
  -- 소셜 로그인
  provider TEXT CHECK (provider IN ('kakao', 'google', 'apple')),
  provider_id TEXT,  -- OAuth provider user id
  
  -- 커뮤니티 통계 (Phase 2)
  review_count INTEGER DEFAULT 0,
  post_count INTEGER DEFAULT 0,
  collection_count INTEGER DEFAULT 0,
  follower_count INTEGER DEFAULT 0,
  following_count INTEGER DEFAULT 0,
  
  -- 게임화 (Phase 3)
  level INTEGER DEFAULT 1,
  experience_points INTEGER DEFAULT 0,
  badge_count INTEGER DEFAULT 0,
  
  -- 알림 설정 (Phase 2)
  notification_settings JSONB DEFAULT '{"email": true, "push": true}'::jsonb,
  
  -- 상태 관리
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted')),
  is_verified BOOLEAN DEFAULT false,
  
  -- 메타데이터
  last_active_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- 인덱스
  CONSTRAINT check_nickname_length CHECK (char_length(nickname) >= 2 AND char_length(nickname) <= 20)
);

-- 인덱스
CREATE INDEX idx_general_users_nickname ON general_users(nickname) WHERE status = 'active';
CREATE INDEX idx_general_users_email ON general_users(email);
CREATE INDEX idx_general_users_provider ON general_users(provider, provider_id);
CREATE INDEX idx_general_users_status ON general_users(status);
CREATE INDEX idx_general_users_created_at ON general_users(created_at DESC);
```

---

### 2.2 admin_users 테이블

```sql
CREATE TABLE admin_users (
  -- 기본 정보
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  
  -- 프로필
  full_name TEXT,
  avatar_url TEXT,
  
  -- 권한
  role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('super_admin', 'admin', 'owner')),
  
  -- 사장님 전용 (Phase 3)
  business_license TEXT,  -- 사업자등록번호
  business_name TEXT,     -- 상호명
  
  -- 보안
  mfa_enabled BOOLEAN DEFAULT false,
  mfa_secret TEXT,
  login_attempt_count INTEGER DEFAULT 0,
  last_login_ip INET,
  last_login_at TIMESTAMP,
  
  -- 상태
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted')),
  
  -- 메타데이터
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by UUID REFERENCES admin_users(id),  -- 누가 생성했는지
  
  -- 감사용
  notes TEXT  -- 내부 메모
);

-- 인덱스
CREATE INDEX idx_admin_users_email ON admin_users(email);
CREATE INDEX idx_admin_users_role ON admin_users(role) WHERE status = 'active';
CREATE INDEX idx_admin_users_status ON admin_users(status);
```

---

### 2.3 shop_owners 테이블 (Phase 3)

```sql
CREATE TABLE shop_owners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  shop_id UUID NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  
  -- 승인 정보
  verified BOOLEAN DEFAULT false,
  verified_at TIMESTAMP,
  verified_by UUID REFERENCES admin_users(id),
  
  -- 메타데이터
  created_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(owner_id, shop_id)
);

CREATE INDEX idx_shop_owners_owner_id ON shop_owners(owner_id);
CREATE INDEX idx_shop_owners_shop_id ON shop_owners(shop_id);
```

---

### 2.4 admin_permissions 테이블 (Phase 2)

```sql
CREATE TABLE permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE admin_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  granted_by UUID REFERENCES admin_users(id),
  granted_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(admin_id, permission_id)
);

CREATE INDEX idx_admin_permissions_admin_id ON admin_permissions(admin_id);
```

---

### 2.5 admin_audit_logs 테이블 (Phase 2)

```sql
CREATE TABLE admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID REFERENCES admin_users(id),
  
  -- 액션 정보
  action TEXT NOT NULL,  -- 'create', 'update', 'delete'
  resource TEXT NOT NULL,  -- 'shop', 'user', 'permission'
  resource_id UUID,
  
  -- 상세 정보
  old_values JSONB,
  new_values JSONB,
  
  -- 메타데이터
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_admin_id ON admin_audit_logs(admin_id);
CREATE INDEX idx_audit_logs_resource ON admin_audit_logs(resource, resource_id);
CREATE INDEX idx_audit_logs_created_at ON admin_audit_logs(created_at DESC);
```

---

## 🔄 3. 통합 테이블 vs 분리 테이블 최종 비교

### 3.1 장단점 표

| 항목 | 통합 테이블 | 분리 테이블 ✅ |
|------|------------|---------------|
| **스키마 단순성** | ✅ 테이블 1개 | ❌ 테이블 2개 |
| **쿼리 단순성** | ❌ user_type 조건 필수 | ✅ 테이블명으로 자연스럽게 구분 |
| **성능** | ❌ 10만+ 레코드 혼재 | ✅ 각각 최적화 (10만 vs 50) |
| **인덱스 효율** | ❌ user_type 때문에 복잡 | ✅ 각 테이블에 최적 인덱스 |
| **확장성** | ❌ 컬럼 충돌 위험 | ✅ 독립적 진화 |
| **조인 패턴** | ❌ 같은 테이블, 다른 목적 | ✅ 명확한 도메인 분리 |
| **RLS 정책** | ❌ 복잡 (user_type 체크) | ✅ 단순 (테이블별 정책) |
| **백업/복구** | ❌ 일반 유저 백업 시 어드민도 포함 | ✅ 선택적 백업 가능 |
| **마이그레이션** | ❌ 어려움 (통합→분리) | ✅ 쉬움 (분리→통합) |
| **팀 협업** | ❌ 스키마 수정 시 충돌 | ✅ 독립적 작업 가능 |

---

### 3.2 코드 가독성 비교

#### **통합 테이블**

```typescript
// ❌ 헷갈림: users 테이블이 어떤 유저인지 불명확
const { data: user } = await supabase
  .from('users')
  .select('*')
  .eq('id', userId)
  .eq('user_type', 'general')  // 항상 조건 추가 필요
  .single()

// ❌ 조인 시 의미 불명확
SELECT u.nickname, r.content
FROM users u
JOIN reviews r ON u.id = r.user_id
WHERE u.user_type = 'general';  -- 왜 이 조건이 필요한지 모호
```

#### **분리 테이블**

```typescript
// ✅ 명확함: general_users는 일반 유저
const { data: user } = await supabase
  .from('general_users')
  .select('*')
  .eq('id', userId)
  .single()

// ✅ 조인 의미 명확
SELECT gu.nickname, r.content
FROM general_users gu
JOIN reviews r ON gu.id = r.user_id;
```

---

### 3.3 미래 확장성

#### **통합 테이블의 한계**

```sql
-- Phase 4: 일반 유저에 게임화 기능 추가
ALTER TABLE users ADD COLUMN level INTEGER;
ALTER TABLE users ADD COLUMN experience_points INTEGER;
ALTER TABLE users ADD COLUMN badge_count INTEGER;

-- 문제: 어드민 유저에게는 불필요한 컬럼!
-- 10만 레코드 중 50개(어드민)만 NULL 값
```

#### **분리 테이블의 유연성**

```sql
-- Phase 4: 일반 유저에만 게임화 기능 추가
ALTER TABLE general_users ADD COLUMN level INTEGER;
ALTER TABLE general_users ADD COLUMN experience_points INTEGER;
ALTER TABLE general_users ADD COLUMN badge_count INTEGER;

-- ✅ admin_users 테이블은 영향 없음!
```

---

## 🚨 4. 통합 테이블의 실제 문제 사례

### 4.1 컬럼 충돌

```sql
-- 일반 유저: 닉네임 필수
nickname TEXT NOT NULL

-- 어드민: 닉네임 불필요, 대신 full_name 사용
full_name TEXT NOT NULL

-- 통합 시 문제:
-- - 둘 다 NULL 허용? → 유효성 검증 복잡
-- - 어플리케이션 레벨에서 체크? → 일관성 문제
```

### 4.2 인덱스 비효율

```sql
-- 일반 유저: 닉네임 검색 빈번
CREATE INDEX idx_users_nickname ON users(nickname) 
WHERE user_type = 'general';

-- 문제: Partial Index는 복잡하고 유지보수 어려움
```

### 4.3 통계 쿼리 비효율

```sql
-- 일반 유저 통계
SELECT COUNT(*) FROM users WHERE user_type = 'general';
-- 문제: 10만 레코드 중 50개 스킵

-- 분리 시
SELECT COUNT(*) FROM general_users;
-- ✅ 깔끔하고 빠름
```

---

## ✅ 5. 최종 권장 아키텍처

```
auth.users (Supabase 관리)
    ├── id (UUID, PK)
    ├── email
    ├── encrypted_password
    └── provider

general_users (일반 유저)
    ├── id (FK → auth.users.id)
    ├── nickname
    ├── avatar_url
    ├── bio
    ├── level
    └── experience_points
    
admin_users (어드민 + 사장)
    ├── id (FK → auth.users.id)
    ├── email
    ├── role (super_admin, admin, owner)
    ├── mfa_enabled
    └── last_login_ip
```

---

## 📝 6. 마이그레이션 전략

### Phase 1: 테이블 생성

```sql
-- 1. general_users 생성
CREATE TABLE general_users (...);

-- 2. admin_users 생성
CREATE TABLE admin_users (...);

-- 3. 기존 users 테이블이 있다면
-- 데이터 마이그레이션
INSERT INTO general_users (...)
SELECT ... FROM users WHERE user_type = 'general';

INSERT INTO admin_users (...)
SELECT ... FROM users WHERE user_type IN ('admin', 'owner');

-- 4. 기존 테이블 삭제 (백업 후)
-- DROP TABLE users;
```

---

## 💡 7. 결론 및 액션 아이템

### **당신의 판단이 맞습니다 ✅**

**분리해야 하는 이유:**
1. **진화 방향이 다름**: 일반 유저는 커뮤니티, 어드민은 권한 관리
2. **조인 관계가 다름**: 일반 유저는 reviews/posts, 어드민은 permissions/audit_logs
3. **성능 최적화**: 10만 vs 50건, 각자 최적 인덱스
4. **코드 가독성**: 테이블명으로 의도 명확
5. **미래 확장성**: 독립적 스키마 진화

**통합이 나은 경우는:**
- 두 유저 타입이 **동일한 Feature Set**을 공유할 때
- 레코드 수가 적고 (< 1000) 성능 이슈가 없을 때
- 스키마가 정말 단순하고 앞으로도 변경 없을 때

→ **가챠맵 프로젝트는 해당 안 됨!**

---

### **즉시 실행 (이번 주)**

- [ ] `general_users` 테이블 생성
- [ ] `admin_users` 테이블 생성
- [ ] 소셜 로그인: `general_users` 프로필 생성 로직
- [ ] 이메일 로그인: `admin_users` role 체크 로직
- [ ] Edge Function 업데이트 (users → general_users/admin_users)

---

## 📚 참고 자료

- [Database Normalization](https://en.wikipedia.org/wiki/Database_normalization)
- [PostgreSQL Table Partitioning](https://www.postgresql.org/docs/current/ddl-partitioning.html)
- [Supabase Multiple Tables Best Practices](https://supabase.com/docs/guides/database/tables)

---

**감사합니다. 실무 경험이 느껴지는 정확한 지적이었습니다!**
