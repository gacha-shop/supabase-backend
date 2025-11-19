# Admin Users 테이블 스키마

> 관리자 및 매장 오너의 인증 및 권한 정보를 저장하는 테이블

## 테이블 개요

- **테이블명**: `admin_users`
- **스키마**: `public`
- **총 컬럼 수**: 19개
- **Row Level Security (RLS)**: 활성화됨
- **Primary Key**: `id` (UUID)
- **현재 행 수**: 8개
- **최종 업데이트**: 2025-11-19

---

## 컬럼 상세 설명

### 1. 기본 정보

| 컬럼명       | 타입        | 필수 | 기본값 | 설명                                |
| ------------ | ----------- | ---- | ------ | ----------------------------------- |
| `id`         | uuid        | ✓    | -      | 사용자 고유 식별자 (auth.users.id)  |
| `email`      | text        | ✓    | -      | 이메일 주소 (UNIQUE, 로그인용)      |
| `full_name`  | text        | -    | null   | 전체 이름                           |
| `avatar_url` | text        | -    | null   | 프로필 이미지 URL                   |
| `created_at` | timestamptz | -    | now()  | 레코드 생성 일시                    |
| `updated_at` | timestamptz | -    | now()  | 레코드 최종 수정 일시               |
| `created_by` | uuid        | -    | null   | 레코드 생성자 ID (FK: admin_users)  |

### 2. 역할 및 권한

| 컬럼명 | 타입 | 필수 | 기본값  | 제약조건                                 | 설명                                                                                                    |
| ------ | ---- | ---- | ------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `role` | text | ✓    | 'admin' | `'super_admin'`, `'admin'`, `'owner'` | 사용자 역할<br>• `super_admin`: 최고 관리자<br>• `admin`: 일반 관리자<br>• `owner`: 매장 소유자 |

### 3. 사업자 정보 (매장 오너용)

| 컬럼명              | 타입 | 필수 | 설명                                                              |
| ------------------- | ---- | ---- | ----------------------------------------------------------------- |
| `business_license`  | text | -    | 사업자 등록번호                                                   |
| `business_name`     | text | -    | 사업자명                                                          |
| `phone`             | varchar | -    | 전화번호 (UNIQUE 제약 없음 - 한 사람이 여러 매장 소유 가능) |

### 4. 승인 상태 (Approval Status)

| 컬럼명             | 타입        | 필수 | 기본값    | 제약조건                               | 설명                                                                                           |
| ------------------ | ----------- | ---- | --------- | -------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `approval_status`  | text        | -    | 'pending' | `'pending'`, `'approved'`, `'rejected'` | 승인 상태<br>• `pending`: 대기중<br>• `approved`: 승인됨 (로그인 가능)<br>• `rejected`: 거부됨 |
| `approved_at`      | timestamptz | -    | null      | -                                      | 승인 일시                                                                                      |
| `approved_by`      | uuid        | -    | null      | FK to admin_users.id                   | 승인한 슈퍼 관리자 ID                                                                          |
| `rejection_reason` | text        | -    | null      | -                                      | 거부 사유 (rejected인 경우)                                                                    |

### 5. 로그인 및 보안

| 컬럼명                 | 타입        | 필수 | 기본값 | 설명                           |
| ---------------------- | ----------- | ---- | ------ | ------------------------------ |
| `login_attempt_count`  | integer     | -    | 0      | 로그인 시도 횟수               |
| `last_login_ip`        | inet        | -    | null   | 마지막 로그인 IP 주소          |
| `last_login_at`        | timestamptz | -    | null   | 마지막 로그인 일시             |

### 6. 상태 관리

| 컬럼명   | 타입 | 필수 | 기본값   | 제약조건                                  | 설명                                                                                   |
| -------- | ---- | ---- | -------- | ----------------------------------------- | -------------------------------------------------------------------------------------- |
| `status` | text | -    | 'active' | `'active'`, `'suspended'`, `'deleted'` | 계정 상태<br>• `active`: 활성<br>• `suspended`: 정지<br>• `deleted`: 삭제 |

### 7. 관리자 메모

| 컬럼명  | 타입 | 필수 | 설명                                     |
| ------- | ---- | ---- | ---------------------------------------- |
| `notes` | text | -    | 관리자 전용 메모 (슈퍼 관리자가 작성)   |

---

## 외래 키 (Foreign Keys)

### 참조하는 키

| 제약조건명                | 소스 컬럼   | 참조 테이블  | 참조 컬럼 | 설명                               |
| ------------------------- | ----------- | ------------ | --------- | ---------------------------------- |
| `admin_users_id_fkey`     | id          | auth.users   | id        | Supabase Auth 사용자와 1:1 매핑    |
| `admin_users_created_by_fkey` | created_by | admin_users | id        | 생성자 (다른 관리자)               |
| `admin_users_approved_by_fkey` | approved_by | admin_users | id        | 승인자 (슈퍼 관리자)               |

### 역참조 (이 테이블을 참조하는 테이블들)

- `shops.verified_by` - 매장 검증자
- `tags.created_by`, `tags.updated_by` - 태그 생성/수정자
- `shop_tags.created_by` - 매장-태그 관계 생성자
- `shop_images.created_by` - 매장 이미지 업로더
- `menus.created_by`, `menus.updated_by` - 메뉴 생성/수정자
- `user_submissions.reviewed_by` - 유저 제보 검토자
- `admin_audit_logs.admin_id` - 관리자 액션 로그
- `admin_permissions.admin_id` - 관리자 권한
- `admin_menu_permissions.admin_id` - 관리자 메뉴 권한
- `shop_owners.owner_id` - 매장 소유자

---

## Row Level Security (RLS) 정책

RLS가 활성화되어 있으며, 다음과 같은 정책이 적용됩니다:

### 1. 본인 정보 조회
- **대상**: `authenticated`
- **작업**: SELECT
- **조건**: `auth.uid() = id`
- **설명**: 자신의 정보만 조회 가능

### 2. 슈퍼 관리자 전체 권한
- **대상**: `authenticated` (role = 'super_admin')
- **작업**: ALL (SELECT, INSERT, UPDATE, DELETE)
- **조건**: JWT 토큰의 role이 'super_admin'
- **설명**: 슈퍼 관리자는 모든 관리자 정보에 접근 가능

### 3. 로그인 시 정보 조회 가능
- **대상**: `authenticated`
- **작업**: SELECT
- **조건**: `approval_status = 'approved'` AND `status = 'active'`
- **설명**: 승인되고 활성화된 관리자 정보는 로그인 시 조회 가능

---

## 데이터 제약 조건 (Constraints)

### CHECK 제약조건

1. **role**: `'super_admin'`, `'admin'`, `'owner'` 중 하나만 허용
2. **approval_status**: `'pending'`, `'approved'`, `'rejected'` 중 하나만 허용
3. **status**: `'active'`, `'suspended'`, `'deleted'` 중 하나만 허용

### UNIQUE 제약조건

1. **email**: 이메일은 고유해야 함

---

## 사용 예시

### 1. 승인 대기 중인 관리자 목록 조회

```sql
SELECT id, email, full_name, role, business_name, created_at
FROM admin_users
WHERE approval_status = 'pending'
  AND status = 'active'
ORDER BY created_at DESC;
```

### 2. 특정 관리자 승인 처리

```sql
UPDATE admin_users
SET
  approval_status = 'approved',
  approved_at = now(),
  approved_by = '슈퍼관리자_UUID'
WHERE id = '승인할관리자_UUID';
```

### 3. 매장 소유자 목록 조회 (소유 매장 포함)

```sql
SELECT
  au.id,
  au.email,
  au.full_name,
  au.business_name,
  array_agg(s.name) AS owned_shops
FROM admin_users au
LEFT JOIN shop_owners so ON au.id = so.owner_id
LEFT JOIN shops s ON so.shop_id = s.id
WHERE au.role = 'owner'
  AND au.approval_status = 'approved'
  AND au.status = 'active'
GROUP BY au.id, au.email, au.full_name, au.business_name;
```

### 4. 관리자 로그인 이력 업데이트

```sql
UPDATE admin_users
SET
  last_login_at = now(),
  last_login_ip = '192.168.1.1',
  login_attempt_count = 0
WHERE id = '관리자_UUID';
```

---

## 관련 Edge Functions

- `admin-auth-signup` - 관리자 회원가입
- `admin-auth-signin` - 관리자 로그인
- `admin-users-get-all` - 모든 관리자 목록 조회 (슈퍼 관리자용)
- `admin-users-approve` - 관리자 승인 처리
- `admin-users-reject` - 관리자 거부 처리

---

## 관련 테이블

- [shop_owners](./shop_owners.md) - 매장 소유자 관계 테이블
- [admin_permissions](./admin_permissions.md) - 관리자 권한 테이블
- [admin_menu_permissions](./admin_menu_permissions.md) - 관리자 메뉴 권한 테이블
- [admin_audit_logs](./admin_audit_logs.md) - 관리자 액션 로그 테이블

---

## 최근 변경 사항

### 2025-11-14: 메뉴 권한 시스템 추가
- `admin_menu_permissions` 테이블 추가로 메뉴별 접근 권한 제어

### 2025-11-13: phone 컬럼 UNIQUE 제약 제거
- 한 사람이 여러 매장을 소유할 수 있도록 변경
- Migration: `20251113020846`

### 2025-11-12: Admin Users 테이블 생성
- 기존 `users` 테이블을 `general_users`와 `admin_users`로 분리
- 이메일 기반 로그인 전용 (소셜 로그인과 구분)
- 승인 상태 시스템 추가 (`approval_status`)
- Migrations: `20251112063516`, `20251112071629`

---

## 주의사항

1. **auth.users 연동**: `id`는 Supabase Auth의 `auth.users.id`와 1:1로 매핑됨
2. **승인 후 로그인 가능**: `approval_status = 'approved'`인 경우에만 로그인 가능
3. **role 기반 권한**: JWT 토큰에 role claim이 포함되어 RLS 정책에서 사용됨
4. **phone UNIQUE 없음**: 한 사람이 여러 매장을 소유할 수 있도록 설계됨
5. **soft delete 미사용**: `status = 'deleted'`로 삭제 표시
