# Menus 테이블 스키마

> 관리자 메뉴 권한 시스템의 메뉴 마스터 테이블

## 테이블 개요

- **테이블명**: `menus`
- **스키마**: `public`
- **총 컬럼 수**: 13개
- **Row Level Security (RLS)**: 활성화됨
- **Primary Key**: `id` (UUID)
- **현재 행 수**: 13개
- **최종 업데이트**: 2025-11-19

---

## 컬럼 상세 설명

### 1. 기본 정보

| 컬럼명       | 타입        | 필수 | 기본값        | 설명                                           |
| ------------ | ----------- | ---- | ------------- | ---------------------------------------------- |
| `id`         | uuid        | ✓    | gen_random_uuid() | 메뉴 고유 식별자 (UUID)                     |
| `code`       | text        | ✓    | -             | 메뉴 고유 코드 (UNIQUE)<br>예: "dashboard", "shops.management" |
| `name`       | text        | ✓    | -             | 메뉴 표시명 (한국어)                           |
| `description`| text        | -    | null          | 메뉴 설명                                      |
| `created_at` | timestamptz | -    | now()         | 레코드 생성 일시                               |
| `updated_at` | timestamptz | -    | now()         | 레코드 최종 수정 일시                          |
| `created_by` | uuid        | -    | null          | 레코드 생성자 ID (FK: admin_users)             |
| `updated_by` | uuid        | -    | null          | 레코드 최종 수정자 ID (FK: admin_users)        |

### 2. 계층 구조

| 컬럼명      | 타입 | 필수 | 설명                                                      |
| ----------- | ---- | ---- | --------------------------------------------------------- |
| `parent_id` | uuid | -    | 부모 메뉴 ID (FK: menus.id)<br>NULL이면 최상위 메뉴     |

### 3. 라우팅 및 표시

| 컬럼명          | 타입    | 필수 | 기본값 | 설명                                        |
| --------------- | ------- | ---- | ------ | ------------------------------------------- |
| `path`          | text    | -    | null   | 라우트 경로 (예: "/shops", "/users")       |
| `icon`          | text    | -    | null   | Lucide 아이콘 이름 (예: "Store", "Users")  |
| `display_order` | integer | ✓    | 999    | 메뉴 목록에서의 표시 순서                  |
| `is_active`     | boolean | -    | true   | 메뉴 활성화 여부                           |

### 4. 메타데이터

| 컬럼명     | 타입  | 필수 | 기본값 | 설명                                                                      |
| ---------- | ----- | ---- | ------ | ------------------------------------------------------------------------- |
| `metadata` | jsonb | -    | '{}'   | 추가 메타데이터 (JSON 형식)<br>예: `{"requiresSuperAdmin": true}` |

---

## 외래 키 (Foreign Keys)

### 참조하는 키

| 제약조건명              | 소스 컬럼   | 참조 테이블  | 참조 컬럼 | 설명               |
| ----------------------- | ----------- | ------------ | --------- | ------------------ |
| `menus_parent_id_fkey`  | parent_id   | menus        | id        | 부모 메뉴 (자기참조) |
| `menus_created_by_fkey` | created_by  | admin_users  | id        | 생성자             |
| `menus_updated_by_fkey` | updated_by  | admin_users  | id        | 수정자             |

### 역참조

- `admin_menu_permissions.menu_id` - 관리자 메뉴 권한

---

## Row Level Security (RLS) 정책

RLS가 활성화되어 있으며, 다음과 같은 정책이 적용됩니다:

### 1. 인증된 사용자 조회 가능
- **대상**: `authenticated`
- **작업**: SELECT
- **조건**: 로그인한 사용자는 모든 메뉴 조회 가능
- **설명**: 메뉴 구조를 확인하기 위해 필요

### 2. 슈퍼 관리자 전체 권한
- **대상**: `authenticated` (role = 'super_admin')
- **작업**: ALL (SELECT, INSERT, UPDATE, DELETE)
- **조건**: JWT 토큰의 role이 'super_admin'
- **설명**: 슈퍼 관리자만 메뉴 추가/수정/삭제 가능

---

## 데이터 제약 조건 (Constraints)

### UNIQUE 제약조건

1. **code**: 메뉴 코드는 고유해야 함

---

## 사용 예시

### 1. 전체 메뉴 트리 구조 조회

```sql
WITH RECURSIVE menu_tree AS (
  -- 최상위 메뉴 (parent_id가 NULL)
  SELECT
    id,
    code,
    name,
    parent_id,
    path,
    icon,
    display_order,
    1 AS level,
    ARRAY[display_order] AS sort_path
  FROM menus
  WHERE parent_id IS NULL
    AND is_active = true

  UNION ALL

  -- 하위 메뉴 재귀 조회
  SELECT
    m.id,
    m.code,
    m.name,
    m.parent_id,
    m.path,
    m.icon,
    m.display_order,
    mt.level + 1,
    mt.sort_path || m.display_order
  FROM menus m
  INNER JOIN menu_tree mt ON m.parent_id = mt.id
  WHERE m.is_active = true
)
SELECT * FROM menu_tree
ORDER BY sort_path;
```

### 2. 특정 관리자가 접근 가능한 메뉴 조회

```sql
SELECT DISTINCT
  m.id,
  m.code,
  m.name,
  m.path,
  m.icon,
  m.parent_id,
  m.display_order
FROM menus m
INNER JOIN admin_menu_permissions amp ON m.id = amp.menu_id
WHERE amp.admin_id = '관리자_UUID'
  AND m.is_active = true
ORDER BY m.display_order;
```

### 3. 새 메뉴 생성

```sql
INSERT INTO menus (code, name, description, parent_id, path, icon, display_order, created_by)
VALUES (
  'shops.management',
  '매장 관리',
  '매장 정보 관리 및 검증',
  'shops',  -- 부모 메뉴 ID
  '/shops',
  'Store',
  1,
  '생성자_UUID'
)
RETURNING *;
```

### 4. 메뉴 표시 순서 변경

```sql
UPDATE menus
SET
  display_order = 5,
  updated_by = '수정자_UUID',
  updated_at = now()
WHERE id = '메뉴_UUID';
```

---

## 현재 메뉴 구조 예시

프로젝트에 현재 등록된 13개의 메뉴 구조:

```
├── 대시보드 (dashboard)
├── 매장 관리 (shops)
│   ├── 매장 목록 (shops.list)
│   ├── 매장 등록 (shops.create)
│   └── 매장 검증 (shops.verification)
├── 사용자 관리 (users)
│   ├── 일반 유저 (users.general)
│   └── 관리자 (users.admin)
├── 태그 관리 (tags)
├── 제보 관리 (submissions)
└── 시스템 설정 (settings)
    ├── 메뉴 관리 (settings.menus)
    └── 권한 관리 (settings.permissions)
```

---

## 관련 Edge Functions

- `admin-menus-get-all` - 모든 메뉴 목록 조회
- `admin-menus-get` - 특정 메뉴 조회
- `admin-menus-create` - 새 메뉴 생성
- `admin-menus-update` - 메뉴 정보 수정
- `admin-menus-delete` - 메뉴 삭제

---

## 관련 테이블

- [admin_menu_permissions](./admin_menu_permissions.md) - 관리자 메뉴 권한 테이블
- [admin_users](./admin_users.md) - 관리자 사용자 테이블

---

## 최근 변경 사항

### 2025-11-14: Menus 테이블 생성
- 메뉴 기반 권한 시스템 도입
- 계층 구조 지원 (parent_id를 통한 재귀 구조)
- 초기 메뉴 데이터 삽입
- Migration: `20251114135555`, `20251114135654`

---

## 주의사항

1. **code는 UNIQUE**: 메뉴 코드는 고유해야 하며, 코드를 통한 메뉴 식별에 사용됨
2. **재귀 구조**: `parent_id`를 통해 무한 계층 구조 지원
3. **display_order**: 작은 숫자가 먼저 표시됨 (ASC 정렬)
4. **is_active**: false로 설정하면 메뉴가 숨겨짐 (삭제하지 않고 비활성화)
5. **슈퍼 관리자만 수정 가능**: 일반 관리자는 메뉴 구조를 변경할 수 없음
6. **metadata 활용**: JSON 형식으로 추가 설정 저장 가능 (예: 슈퍼 관리자 전용 메뉴 표시)
