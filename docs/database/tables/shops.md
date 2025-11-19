# Shops 테이블 스키마

> 가챠샵/피규어샵 정보를 저장하는 메인 테이블

## 테이블 개요

- **테이블명**: `shops`
- **총 컬럼 수**: 31개
- **Row Level Security (RLS)**: 활성화됨
- **Primary Key**: `id` (UUID)

---

## 컬럼 상세 설명

### 1. 기본 정보 (Core Fields)

| 컬럼명       | 타입        | 필수 | 기본값             | 설명                                      |
| ------------ | ----------- | ---- | ------------------ | ----------------------------------------- |
| `id`         | uuid        | ✓    | uuid_generate_v4() | 매장 고유 식별자 (기본키)                 |
| `created_at` | timestamptz | ✓    | now()              | 레코드 생성 시각                          |
| `updated_at` | timestamptz | ✓    | now()              | 레코드 수정 시각 (트리거로 자동 업데이트) |
| `is_deleted` | boolean     | ✓    | false              | 소프트 삭제 여부 (삭제 시 true)           |
| `deleted_at` | timestamptz | -    | null               | 삭제된 시각 (트리거로 자동 설정)          |
| `created_by` | uuid        | -    | null               | 레코드 생성자 사용자 ID                   |
| `updated_by` | uuid        | -    | null               | 레코드 수정자 사용자 ID                   |

### 2. 매장 기본 정보 (Shop Information)

| 컬럼명        | 타입        | 필수 | 제약조건                        | 설명                                                                                       |
| ------------- | ----------- | ---- | ------------------------------- | ------------------------------------------------------------------------------------------ |
| `name`        | text        | ✓    | -                               | 매장명                                                                                     |
| `shop_type`   | text        | ✓    | `'gacha'`, `'figure'`, `'both'` | 매장 유형<br>• `gacha`: 가챠 전문<br>• `figure`: 피규어 전문<br>• `both`: 가챠+피규어 복합 |
| `description` | text        | -    | -                               | 매장 소개 및 설명                                                                          |
| `phone`       | varchar(20) | -    | -                               | 매장 전화번호                                                                              |
| `social_urls` | jsonb       | -    | -                               | SNS URL 정보 (JSON 형식)<br>예: `{"website": "https://...", "instagram": "https://...", "x": "https://...", "youtube": "https://..."}` |

### 3. 주소 및 위치 정보 (Location Data)

| 컬럼명          | 타입          | 필수 | 제약조건   | 설명                           |
| --------------- | ------------- | ---- | ---------- | ------------------------------ |
| `address_full`  | text          | ✓    | -          | 전체 주소 (통합된 주소 문자열) |
| `postal_code`   | varchar(10)   | -    | -          | 우편번호                       |
| `latitude`      | numeric(10,8) | ✓    | -90 ~ 90   | 위도 (지도 표시용)             |
| `longitude`     | numeric(11,8) | ✓    | -180 ~ 180 | 경도 (지도 표시용)             |
| `region_level1` | varchar(50)   | ✓    | -          | 시/도 (예: 서울특별시, 경기도) |
| `region_level2` | varchar(50)   | -    | -          | 시/군/구 (예: 강남구, 수원시)  |
| `region_level3` | varchar(50)   | -    | -          | 읍/면/동 (예: 역삼동, 매탄동)  |

**위치 정보 인덱스**:

- `idx_shops_latitude`: 위도 기반 검색
- `idx_shops_longitude`: 경도 기반 검색
- `idx_shops_region`: 지역 기반 검색 (level1, level2 복합)

### 4. 영업 정보 (Business Information)

| 컬럼명           | 타입    | 필수 | 기본값 | 설명                                                                                 |
| ---------------- | ------- | ---- | ------ | ------------------------------------------------------------------------------------ |
| `business_hours` | jsonb   | -    | null   | 영업시간 정보 (JSON 형식)<br>예: `{"mon": "10:00-22:00", "tue": "10:00-22:00", ...}` |
| `is_24_hours`    | boolean | -    | false  | 24시간 영업 여부                                                                     |

### 5. 가챠 관련 정보 (Gacha-specific Data)

| 컬럼명                | 타입    | 필수 | 제약조건 | 설명                                                               |
| --------------------- | ------- | ---- | -------- | ------------------------------------------------------------------ |
| `gacha_machine_count` | integer | -    | >= 0     | 보유 가챠 기계 대수                                                |
| `main_series`         | text[]  | -    | -        | 주요 취급 시리즈/브랜드 목록<br>예: `['포켓몬', '짱구', '디즈니']` |

### 6. 검증 및 신뢰도 (Verification & Reliability)

| 컬럼명                | 타입        | 필수 | 기본값    | 제약조건                                | 설명                                                                                           |
| --------------------- | ----------- | ---- | --------- | --------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `verification_status` | text        | ✓    | 'pending' | `'pending'`, `'verified'`, `'rejected'` | 매장 검증 상태<br>• `pending`: 검증 대기<br>• `verified`: 검증 완료<br>• `rejected`: 검증 거부 |
| `verified_at`         | timestamptz | -    | null      | -                                       | 검증 완료 시각                                                                                 |
| `verified_by`         | uuid        | -    | null      | -                                       | 검증자 사용자 ID (관리자)                                                                      |
| `data_source`         | text        | ✓    | -         | -                                       | 데이터 출처<br>예: `'user_submit'`, `'admin_input'`, `'crawling'`, `'partner_api'`             |
| `last_confirmed_at`   | timestamptz | -    | null      | -                                       | 매장 정보가 마지막으로 확인된 시각                                                             |

**검증 관련 인덱스**:

- `idx_shops_verification_status`: 검증 상태 기반 필터링

### 7. 미디어 및 표시 (Media & Display)

| 컬럼명            | 타입   | 필수 | 기본값 | 설명                                                         |
| ----------------- | ------ | ---- | ------ | ------------------------------------------------------------ |
| `thumbnail_url`   | text   | -    | null   | 썸네일 이미지 URL (목록 표시용)                              |
| `cover_image_url` | text   | -    | null   | 커버 이미지 URL (상세 페이지용)                              |

### 8. 관리자 메모 (Admin Notes)

| 컬럼명        | 타입 | 필수 | 설명                                                |
| ------------- | ---- | ---- | --------------------------------------------------- |
| `admin_notes` | text | -    | 관리자 전용 메모 (내부용, 사용자에게 노출되지 않음) |

---

## 인덱스 목록

총 11개의 인덱스가 생성되어 있습니다:

| 인덱스명                        | 대상 컬럼                           | 조건               | 용도                         |
| ------------------------------- | ----------------------------------- | ------------------ | ---------------------------- |
| `idx_shops_latitude`            | latitude                            | is_deleted = false | 위도 기반 지도 검색          |
| `idx_shops_longitude`           | longitude                           | is_deleted = false | 경도 기반 지도 검색          |
| `idx_shops_verification_status` | verification_status                 | is_deleted = false | 검증 상태 필터링             |
| `idx_shops_shop_type`           | shop_type                           | is_deleted = false | 매장 유형 필터링             |
| `idx_shops_region`              | region_level1, region_level2        | is_deleted = false | 지역별 검색                  |
| `idx_shops_created_at`          | created_at DESC                     | is_deleted = false | 최신순 정렬                  |
| `idx_shops_name_search`         | to_tsvector('simple', name)         | is_deleted = false | 매장명 전문 검색 (Full-text) |
| `idx_shops_address_search`      | to_tsvector('simple', address_full) | is_deleted = false | 주소 전문 검색 (Full-text)   |
| `idx_shops_deleted`             | is_deleted, deleted_at              | -                  | 삭제된 레코드 관리           |

---

## 트리거 (Triggers)

### 1. `trigger_shops_updated_at`

- **함수**: `update_updated_at_column()`
- **시점**: BEFORE UPDATE
- **동작**: 레코드 수정 시 `updated_at` 컬럼을 자동으로 현재 시각으로 업데이트

### 2. `trigger_shops_deleted_at`

- **함수**: `set_deleted_at()`
- **시점**: BEFORE UPDATE
- **동작**:
  - `is_deleted`가 false → true로 변경 시: `deleted_at`을 현재 시각으로 설정
  - `is_deleted`가 true → false로 변경 시: `deleted_at`을 NULL로 초기화

---

## Row Level Security (RLS) 정책

### 1. "Public users can view verified shops"

- **대상**: `anon`, `authenticated` 역할
- **작업**: SELECT
- **조건**: `verification_status = 'verified' AND is_deleted = false`
- **설명**: 비회원과 회원 모두 검증된 매장만 조회 가능

### 2. "Users can view shops they favorited"

- **대상**: `authenticated` 역할
- **작업**: SELECT
- **조건**: `is_deleted = false`
- **설명**: 로그인한 사용자는 즐겨찾기한 매장 조회 가능

### 3. "Admins have full access"

- **대상**: `authenticated` 역할 (role = 'admin')
- **작업**: ALL (SELECT, INSERT, UPDATE, DELETE)
- **조건**: JWT 토큰의 role이 'admin'
- **설명**: 관리자는 모든 작업 가능

---

## 데이터 제약 조건 (Constraints)

### CHECK 제약조건

1. **shop_type**: `'gacha'`, `'figure'`, `'both'` 중 하나만 허용
2. **latitude**: -90 이상 90 이하
3. **longitude**: -180 이상 180 이하
4. **gacha_machine_count**: 0 이상
5. **verification_status**: `'pending'`, `'verified'`, `'rejected'` 중 하나만 허용
6. **reliability_score**: 0 이상 100 이하

### NOT NULL 제약조건

- `id`, `created_at`, `updated_at`, `is_deleted` (시스템 필드)
- `name`, `shop_type` (매장 기본 정보)
- `address_full`, `latitude`, `longitude`, `region_level1` (��치 정보)
- `verification_status`, `data_source` (검증 정보)

---

## 사용 예시

### 1. 검증된 매장 목록 조회 (지역별)

```sql
SELECT id, name, shop_type, address_full, latitude, longitude
FROM shops
WHERE verification_status = 'verified'
  AND is_deleted = false
  AND region_level1 = '서울특별시'
  AND region_level2 = '강남구'
ORDER BY created_at DESC;
```

### 2. 가챠 기계가 많은 매장 찾기

```sql
SELECT name, gacha_machine_count, main_series
FROM shops
WHERE shop_type IN ('gacha', 'both')
  AND is_deleted = false
  AND verification_status = 'verified'
  AND gacha_machine_count > 10
ORDER BY gacha_machine_count DESC;
```

### 3. 매장명 전문 검색

```sql
SELECT name, address_full, phone
FROM shops
WHERE to_tsvector('simple', name) @@ to_tsquery('simple', '강남')
  AND is_deleted = false
  AND verification_status = 'verified';
```

### 4. 신뢰도 높은 매장 조회

```sql
SELECT name, reliability_score, last_confirmed_at
FROM shops
WHERE reliability_score >= 80
  AND is_deleted = false
  AND verification_status = 'verified'
ORDER BY reliability_score DESC, last_confirmed_at DESC;
```

---

## 주의사항

1. **소프트 삭제 사용**: 레코드를 완전히 삭제하지 않고 `is_deleted = true`로 표시
2. **자동 타임스탬프**: `updated_at`과 `deleted_at`은 트리거로 자동 관리됨
3. **RLS 활성화**: 직접 SQL 쿼리 시 RLS 정책 고려 필요
4. **전문 검색**: `name`과 `address_full`은 GIN 인덱스로 빠른 검색 지원
5. **좌표 정확도**: 위도는 소수점 8자리, 경도는 소수점 8자리까지 저장 (약 1.1mm 정밀도)
6. **JSONB 구조**: `business_hours`는 요일별 영업시간을 JSON 형태로 저장

---

## 향후 확장 가능성

현재 삭제된 컬럼들은 향후 필요 시 다시 추가 가능:

- 파트너십 관련: `owner_user_id`, `is_partner`, `partner_tier`, `claimed_at`
- 소셜/참여 지표: `view_count`, `favorite_count`, `review_count`, `average_rating`
- 추천 시스템: `is_featured`, `display_order`
- 상세 주소: `address_detail`, `address_road`, `address_jibun`
- 영업 정보: `regular_holiday`

## 최근 변경 사항

### 2025-11-01: tags 컬럼 → 별도 테이블 분리

- **변경 내용**: `tags` 컬럼(text[] 배열)을 제거하고, `tags` 테이블과 `shop_tags` 중간 테이블로 분리
- **목적**:
  - 태그를 중앙에서 일관성 있게 관리 (오타 방지)
  - 태그별 사용 현황 추적 및 CRUD 관리 가능
  - 태그 이름 변경 시 모든 스토어에 자동 반영
  - M:N 관계로 태그별 스토어 검색 성능 최적화
- **새로운 구조**:
  - `tags` 테이블: 태그 마스터 데이터 (id, name, description)
  - `shop_tags` 테이블: shops ↔ tags 다대다 관계 연결
- **상세 문서**: [tags.md](../../../tags.md) 참조

### 2025-01-11: website_url → social_urls 전환

- **변경 내용**: 단일 `website_url` 컬럼을 `social_urls` (jsonb) 컬럼으로 변경
- **목적**: 웹사이트뿐만 아니라 Instagram, X(Twitter), YouTube 등 다양한 SNS URL을 저장할 수 있도록 개선
- **구조**:
  ```json
  {
    "website": "https://example.com",      // Optional
    "instagram": "https://instagram.com/...", // Optional
    "x": "https://x.com/...",              // Optional
    "youtube": "https://youtube.com/..."   // Optional
  }
  ```
- **기존 데이터**: 기존 `website_url` 값은 자동으로 `{"website": "기존값"}` 형태로 마이그레이션됨
