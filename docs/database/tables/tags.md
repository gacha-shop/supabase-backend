테이블 구조 설계

1. tags 테이블 (태그 마스터)

어드민에서 CRUD로 관리할 태그 정보를 저장합니다.

CREATE TABLE tags (
-- 기본 정보
id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
name text NOT NULL UNIQUE, -- 태그명 (예: "주차가능", "신작 많음")
description text, -- 태그 설명 (선택)

    -- 메타 정보
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid REFERENCES auth.users(id),
    updated_by uuid REFERENCES auth.users(id),

    -- 소프트 삭제
    is_deleted boolean NOT NULL DEFAULT false,
    deleted_at timestamptz

);

-- 인덱스
CREATE INDEX idx_tags_name ON tags(name) WHERE is_deleted = false;
CREATE INDEX idx_tags_deleted ON tags(is_deleted, deleted_at);

2. shop_tags 테이블 (중간 테이블 / Junction Table)

shops와 tags의 다대다 관계를 연결합니다.

CREATE TABLE shop_tags (
-- 기본 정보
id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
shop_id uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
tag_id uuid NOT NULL REFERENCES tags(id) ON DELETE CASCADE,

    -- 메타 정보
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid REFERENCES auth.users(id),

    -- 제약 조건: 같은 shop과 tag 조합은 한 번만 허용
    CONSTRAINT unique_shop_tag UNIQUE(shop_id, tag_id)

);

-- 인덱스
CREATE INDEX idx_shop_tags_shop_id ON shop_tags(shop_id);
CREATE INDEX idx_shop_tags_tag_id ON shop_tags(tag_id);

3. shops 테이블 수정

기존 tags 컬럼을 제거합니다.

ALTER TABLE shops DROP COLUMN tags;

ER 다이어그램 (관계도)

┌─────────────┐ ┌──────────────┐ ┌─────────────┐
│ shops │ │ shop_tags │ │ tags │
├─────────────┤ ├──────────────┤ ├─────────────┤
│ id (PK) │────┐ │ id (PK) │ ┌────│ id (PK) │
│ name │ └───<│ shop_id (FK) │ │ │ name (UQ) │
│ shop_type │ │ tag_id (FK) │>───┘ │ description │
│ ... │ │ created_at │ │ created_at │
└─────────────┘ └──────────────┘ └─────────────┘
1 M : N 1

데이터 조회 쿼리 예시

1. 특정 스토어의 태그 목록 조회

SELECT
s.id,
s.name AS shop_name,
t.id AS tag_id,
t.name AS tag_name
FROM shops s
LEFT JOIN shop_tags st ON s.id = st.shop_id
LEFT JOIN tags t ON st.tag_id = t.id AND t.is_deleted = false
WHERE s.id = '스토어\_UUID'
AND s.is_deleted = false;

2. 모든 스토어와 태그 조인 (집계)

SELECT
s.id,
s.name,
s.shop_type,
s.address_full,
array_agg(t.name ORDER BY t.name) AS tags
FROM shops s
LEFT JOIN shop_tags st ON s.id = st.shop_id
LEFT JOIN tags t ON st.tag_id = t.id AND t.is_deleted = false
WHERE s.is_deleted = false
AND s.verification_status = 'verified'
GROUP BY s.id, s.name, s.shop_type, s.address_full;

3. 특정 태그를 가진 스토어 검색

-- "주차가능" 태그가 있는 스토어 찾기
SELECT DISTINCT
s.id,
s.name,
s.address_full
FROM shops s
JOIN shop_tags st ON s.id = st.shop_id
JOIN tags t ON st.tag_id = t.id
WHERE t.name = '주차가능'
AND s.is_deleted = false
AND t.is_deleted = false;

4. 여러 태그로 필터링 (AND 조건)

-- "주차가능" AND "신작 많음" 두 태그를 모두 가진 스토어
SELECT s.id, s.name
FROM shops s
WHERE s.id IN (
SELECT st.shop_id
FROM shop_tags st
JOIN tags t ON st.tag_id = t.id
WHERE t.name IN ('주차가능', '신작 많음')
AND t.is_deleted = false
GROUP BY st.shop_id
HAVING COUNT(DISTINCT t.id) = 2
)
AND s.is_deleted = false;

어드민 CRUD 기능별 쿼리

태그 생성 (Create)

INSERT INTO tags (name, description, created_by)
VALUES ('주차가능', '주차 공간이 있는 매장', '어드민\_UUID')
RETURNING \*;

태그 목록 조회 (Read)

SELECT
id,
name,
description,
created_at,
(SELECT COUNT(\*) FROM shop_tags WHERE tag_id = tags.id) AS usage_count
FROM tags
WHERE is_deleted = false
ORDER BY name;

태그 수정 (Update)

UPDATE tags
SET name = '주차 가능',
description = '무료 주차 공간 제공',
updated_by = '어드민\_UUID',
updated_at = now()
WHERE id = '태그\_UUID';

태그 삭제 (Delete - 소프트 삭제)

UPDATE tags
SET is_deleted = true,
deleted_at = now()
WHERE id = '태그\_UUID';

스토어에 태그 추가

INSERT INTO shop_tags (shop_id, tag_id, created_by)
VALUES ('스토어\_UUID', '태그\_UUID', '어드민\_UUID')
ON CONFLICT (shop_id, tag_id) DO NOTHING; -- 중복 방지

스토어에서 태그 제거

DELETE FROM shop_tags
WHERE shop_id = '스토어\_UUID'
AND tag_id = '태그\_UUID';

마이그레이션 전략

기존 shops.tags 배열 데이터를 새 구조로 이전하는 스크립트:

-- 1. 기존 tags 배열에서 고유한 태그들을 tags 테이블에 추가
INSERT INTO tags (name)
SELECT DISTINCT unnest(tags) AS tag_name
FROM shops
WHERE tags IS NOT NULL
AND array_length(tags, 1) > 0
ON CONFLICT (name) DO NOTHING;

-- 2. shop_tags 관계 생성
INSERT INTO shop_tags (shop_id, tag_id)
SELECT DISTINCT
s.id AS shop_id,
t.id AS tag_id
FROM shops s
CROSS JOIN LATERAL unnest(s.tags) AS tag_name
JOIN tags t ON t.name = tag_name
WHERE s.tags IS NOT NULL;

-- 3. 기존 tags 컬럼 제거
ALTER TABLE shops DROP COLUMN tags;

이 구조의 장점:

- ✅ 태그를 중앙에서 일관성 있게 관리 (오타 방지)
- ✅ 태그별 사용 현황 추적 가능
- ✅ 태그 이름 변경 시 모든 스토어에 자동 반영
- ✅ 태그별 스토어 검색 성능 최적화
- ✅ 불필요한 중복 데이터 제거

## Edge Functions API Documentation

### 1. Tags Management API (`admin-tags`)

**Base URL**: `https://[PROJECT_URL]/functions/v1/admin-tags`

#### List All Tags
```http
GET /admin-tags
Authorization: Bearer {JWT_TOKEN}
```

**Response**:
```json
{
  "data": [
    {
      "id": "uuid",
      "name": "주차가능",
      "description": "주차 공간이 있는 매장",
      "created_at": "2025-01-01T00:00:00Z",
      "updated_at": "2025-01-01T00:00:00Z",
      "created_by": "uuid",
      "updated_by": "uuid",
      "is_deleted": false,
      "deleted_at": null,
      "shop_tags": [{ "count": 5 }]
    }
  ]
}
```

#### Get Single Tag
```http
GET /admin-tags?id={TAG_ID}
Authorization: Bearer {JWT_TOKEN}
```

#### Create Tag
```http
POST /admin-tags
Authorization: Bearer {JWT_TOKEN}
Content-Type: application/json

{
  "name": "주차가능",
  "description": "주차 공간이 있는 매장"
}
```

**Response** (201):
```json
{
  "data": {
    "id": "uuid",
    "name": "주차가능",
    "description": "주차 공간이 있는 매장",
    "created_at": "2025-01-01T00:00:00Z",
    ...
  }
}
```

#### Update Tag
```http
PUT /admin-tags
Authorization: Bearer {JWT_TOKEN}
Content-Type: application/json

{
  "id": "tag-uuid",
  "name": "주차 가능",
  "description": "무료 주차 공간 제공"
}
```

#### Delete Tag (Soft Delete)
```http
DELETE /admin-tags?id={TAG_ID}
Authorization: Bearer {JWT_TOKEN}
```

**Response**:
```json
{
  "data": { ... },
  "message": "Tag deleted successfully"
}
```

---

### 2. Shop Management API Changes

#### Create Shop (`admin-create-shop`)

**Updated Request Body**:
```json
{
  "name": "가챠샵 강남점",
  "shop_type": "gacha",
  "road_address": "서울특별시 강남구 테헤란로 123",
  "sido": "서울특별시",
  "latitude": 37.5665,
  "longitude": 126.9780,
  "tag_ids": ["tag-uuid-1", "tag-uuid-2", "tag-uuid-3"],
  ...
}
```

**Response** (includes tags):
```json
{
  "data": {
    "id": "shop-uuid",
    "name": "가챠샵 강남점",
    "shop_tags": [
      {
        "tag_id": "tag-uuid-1",
        "tags": {
          "id": "tag-uuid-1",
          "name": "주차가능",
          "description": "주차 공간 있음"
        }
      }
    ],
    ...
  }
}
```

#### Update Shop (`admin-update-shop`)

**Updated Request Body**:
```json
{
  "id": "shop-uuid",
  "name": "가챠샵 강남점",
  "tag_ids": ["tag-uuid-1", "tag-uuid-2"]
}
```

**Note**: When `tag_ids` is provided, all existing tags are replaced with the new ones.

#### List Shops (`admin-list-shops`)

**Response** (includes tags):
```json
{
  "data": [
    {
      "id": "shop-uuid",
      "name": "가챠샵 강남점",
      "shop_tags": [
        {
          "tag_id": "tag-uuid-1",
          "tags": {
            "id": "tag-uuid-1",
            "name": "주차가능",
            "description": null
          }
        }
      ],
      ...
    }
  ],
  "pagination": { ... }
}
```

#### Get Shop (`admin-get-shop`)

**Response** (includes tags):
```json
{
  "data": {
    "id": "shop-uuid",
    "name": "가챠샵 강남점",
    "shop_tags": [
      {
        "tag_id": "tag-uuid-1",
        "tags": {
          "id": "tag-uuid-1",
          "name": "주차가능",
          "description": "주차 공간 있음"
        }
      }
    ],
    ...
  }
}
```

---

## Client Implementation Guide

### 1. Tags Management Page

```typescript
// Fetch all tags with usage count
const fetchTags = async () => {
  const response = await fetch(
    `${SUPABASE_URL}/functions/v1/admin-tags`,
    {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    }
  );
  const { data } = await response.json();
  return data;
};

// Create new tag
const createTag = async (name: string, description?: string) => {
  const response = await fetch(
    `${SUPABASE_URL}/functions/v1/admin-tags`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name, description }),
    }
  );
  return response.json();
};

// Update tag
const updateTag = async (id: string, name: string, description?: string) => {
  const response = await fetch(
    `${SUPABASE_URL}/functions/v1/admin-tags`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ id, name, description }),
    }
  );
  return response.json();
};

// Delete tag
const deleteTag = async (id: string) => {
  const response = await fetch(
    `${SUPABASE_URL}/functions/v1/admin-tags?id=${id}`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    }
  );
  return response.json();
};
```

### 2. Shop Registration Modal (StoreRegistrationModal.tsx)

```typescript
// Fetch tags for selection
const [tags, setTags] = useState([]);
const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);

useEffect(() => {
  const loadTags = async () => {
    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/admin-tags`,
      {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      }
    );
    const { data } = await response.json();
    setTags(data);
  };
  loadTags();
}, []);

// When submitting shop data
const handleSubmit = async (shopData) => {
  const response = await fetch(
    `${SUPABASE_URL}/functions/v1/admin-create-shop`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...shopData,
        tag_ids: selectedTagIds, // Include selected tag IDs
      }),
    }
  );
  return response.json();
};
```

---

## Summary

All edge functions have been updated to support the new tags relationship:

✅ **admin-tags** - New CRUD API for tags management
✅ **admin-create-shop** - Accepts `tag_ids` array, creates shop_tags relationships
✅ **admin-update-shop** - Accepts `tag_ids` array, replaces all existing tags
✅ **admin-list-shops** - Returns shops with joined tags data
✅ **admin-get-shop** - Returns shop with joined tags data

All functions are deployed and ready to use!
