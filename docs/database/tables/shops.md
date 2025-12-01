# Shops 테이블 스키마

> 가챠샵/피규어샵 정보를 저장하는 메인 테이블

## 테이블 개요

- **테이블명**: `shops`
- **스키마**: `public`
- **총 컬럼 수**: 34개
- **Row Level Security (RLS)**: 활성화됨
- **Primary Key**: `id` (UUID)
- **현재 행 수**: 29개
- **최종 업데이트**: 2025-11-19

---

## 컬럼 상세 설명

### 1. 기본 정보 (Core Fields)

| 컬럼명       | 타입        | 필수 | 기본값             | 설명                          |
| ------------ | ----------- | ---- | ------------------ | ----------------------------- |
| `id`         | uuid        | ✓    | uuid_generate_v4() | 상점 고유 식별자 (UUID)       |
| `created_at` | timestamptz | ✓    | now()              | 레코드 생성 일시              |
| `updated_at` | timestamptz | ✓    | now()              | 레코드 최종 수정 일시         |
| `is_deleted` | boolean     | ✓    | false              | 삭제 여부 (소프트 삭제)       |
| `deleted_at` | timestamptz | -    | null               | 삭제 처리 일시                |
| `created_by` | uuid        | ✓    | -                  | 레코드 생성자 ID (auth.users) |
| `updated_by` | uuid        | -    | null               | 레코드 최종 수정자 ID         |

### 2. 상점 기본 정보 (Shop Information)

| 컬럼명        | 타입    | 필수 | 제약조건                                  | 설명                                                                                                                     |
| ------------- | ------- | ---- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `name`        | text    | ✓    | -                                         | 상점명                                                                                                                   |
| `shop_type`   | text[]  | ✓    | `['gacha', 'figure', 'claw']` 중 1개 이상 | 상점 유형 (다중 선택 가능)<br>• `gacha`: 가챠<br>• `figure`: 피규어<br>• `claw`: 클로우<br>예: `['gacha', 'claw']` |
| `description` | text    | -    | null                                      | 상점 설명 및 소개                                                                                                        |
| `phone`       | varchar | -    | null                                      | 상점 연락처 (전화번호)                                                                                                   |

### 3. 주소 정보 (Address)

| 컬럼명           | 타입    | 필수 | 기본값 | 설명                                       |
| ---------------- | ------- | ---- | ------ | ------------------------------------------ |
| `sido`           | varchar | ✓    | ''     | 시/도 (예: 서울특별시, 경기도)             |
| `sigungu`        | varchar | -    | null   | 시/군/구 (예: 강남구, 수원시)              |
| `jibun_address`  | text    | -    | null   | 지번 주소                                  |
| `road_address`   | text    | ✓    | ''     | 도로명 주소                                |
| `detail_address` | text    | -    | null   | 상세 주소 (동/호수 등)                     |
| `zone_code`      | varchar | -    | null   | 우편번호 (5자리)                           |
| `building_name`  | varchar | -    | null   | 건물명                                     |
| `address_type`   | varchar | -    | null   | 주소 타입: R(도로명), J(지번) CHECK 제약조건 |

### 4. 위치 정보 (Location)

| 컬럼명      | 타입    | 필수 | 제약조건          | 설명                |
| ----------- | ------- | ---- | ----------------- | ------------------- |
| `latitude`  | numeric | -    | -90 <= val <= 90  | 위도 좌표 (지도용)  |
| `longitude` | numeric | -    | -180 <= val <= 180 | 경도 좌표 (지도용) |

### 5. 영업 정보 (Business Information)

| 컬럼명           | 타입    | 필수 | 기본값 | 설명                                                                                  |
| ---------------- | ------- | ---- | ------ | ------------------------------------------------------------------------------------- |
| `business_hours` | jsonb   | -    | null   | 영업시간 정보 (JSON 형식)<br>예: `{"mon": "10:00-22:00", "tue": "10:00-22:00", ...}` |
| `is_24_hours`    | boolean | -    | false  | 24시간 영업 여부                                                                      |

### 6. 가챠 관련 정보 (Gacha-specific)

| 컬럼명                | 타입    | 필수 | 제약조건 | 설명                                                                |
| --------------------- | ------- | ---- | -------- | ------------------------------------------------------------------- |
| `gacha_machine_count` | integer | -    | >= 0     | 보유 가챠 머신 대수                                                 |
| `main_series`         | text[]  | -    | null     | 주요 취급 시리즈 목록 (배열)<br>예: `['포켓몬', '짱구', '디즈니']` |

### 7. SNS 정보 (Social Media)

| 컬럼명        | 타입  | 필수 | 설명                                                                                                                                                                   |
| ------------- | ----- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `social_urls` | jsonb | -    | SNS URLs (JSON 형식)<br>예: `{"website": "https://...", "instagram": "https://...", "x": "https://...", "youtube": "https://..."}` |

### 8. 검증 및 신뢰도 (Verification)

| 컬럼명                | 타입        | 필수 | 기본값    | 제약조건                                | 설명                                                                                                |
| --------------------- | ----------- | ---- | --------- | --------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `verification_status` | text        | ✓    | 'pending' | `'pending'`, `'verified'`, `'rejected'` | 검증 상태<br>• `pending`: 대기중<br>• `verified`: 승인됨<br>• `rejected`: 거부됨                    |
| `verified_at`         | timestamptz | -    | null      | -                                       | 검증 완료 일시                                                                                      |
| `verified_by`         | uuid        | -    | null      | FK to admin_users.id                    | 검증자 ID (관리자)                                                                                  |
| `data_source`         | text        | ✓    | -         | CHECK 제약조건                          | 데이터 출처<br>`'user_submit'`, `'admin_input'`, `'crawling'`, `'partner_api'`                      |
| `last_confirmed_at`   | timestamptz | -    | null      | -                                       | 정보 최종 확인 일시 (정확성 확인)                                                                   |

### 9. 관리자 메모 및 제보 정보 (Admin & Submission)

| 컬럼명             | 타입 | 필수 | 설명                                                 |
| ------------------ | ---- | ---- | ---------------------------------------------------- |
| `admin_notes`      | text | -    | 관리자 전용 메모 (내부 관리용)                       |
| `submission_note`  | text | -    | 제보자 코멘트 (일반 유저 → 어드민)                   |
| `rejection_reason` | text | -    | 반려 사유 (어드민 → 제보자, 유저 공개용)             |

---

## 외래 키 (Foreign Keys)

| 제약조건명                        | 소스 컬럼       | 참조 테이블         | 참조 컬럼 | 설명                   |
| --------------------------------- | --------------- | ------------------- | --------- | ---------------------- |
| `shops_created_by_auth_users`     | created_by      | auth.users          | id        | 생성자 (auth.users)    |
| `shops_updated_by_auth_users`     | updated_by      | auth.users          | id        | 수정자 (auth.users)    |
| `fk_shops_verified_by_admin_users` | verified_by     | admin_users         | id        | 검증자 (관리자)        |
| -                                 | -               | shop_tags           | shop_id   | 태그 관계 (역참조)     |
| -                                 | -               | shop_owners         | shop_id   | 소유자 관계 (역참조)   |
| -                                 | -               | shop_images         | shop_id   | 이미지 관계 (역참조)   |
| -                                 | -               | user_submissions    | shop_id   | 유저 제보 (역참조)     |

---

## Row Level Security (RLS) 정책

RLS가 활성화되어 있으며, 다음과 같은 정책이 적용됩니다:

### 1. 퍼블릭 접근 (인증되지 않은 사용자 + 일반 유저)

- **대상**: `anon`, `authenticated` (general_users)
- **작업**: SELECT
- **조건**:
  - `verification_status = 'verified'`
  - `is_deleted = false`
- **설명**: 검증된 매장만 공개 조회 가능

### 2. 관리자 전체 권한

- **대상**: `authenticated` (admin_users, super_admin)
- **작업**: ALL (SELECT, INSERT, UPDATE, DELETE)
- **조건**:
  - JWT 토큰의 role이 'admin', 'super_admin', 또는 'owner'
- **설명**: 관리자는 모든 작업 가능

### 3. 매장 소유자 권한

- **대상**: `authenticated` (owner 역할)
- **작업**: SELECT, UPDATE
- **조건**:
  - shop_owners 테이블을 통해 소유 관계 확인
  - 자신이 소유한 매장만 조회/수정 가능
- **설명**: 오너는 자신의 매장만 관리 가능

---

## 데이터 제약 조건 (Constraints)

### CHECK 제약조건

1. **shop_type**: `['gacha', 'figure', 'claw']` 배열의 부분집합이어야 하며, 최소 1개 이상 선택
2. **latitude**: -90 이상 90 이하
3. **longitude**: -180 이상 180 이하
4. **gacha_machine_count**: 0 이상
5. **verification_status**: `'pending'`, `'verified'`, `'rejected'` 중 하나만 허용
6. **data_source**: `'user_submit'`, `'admin_input'`, `'crawling'`, `'partner_api'` 중 하나만 허용
7. **address_type**: `'R'` (도로명) 또는 `'J'` (지번)

---

## 사용 예시

### 1. 검증된 매장 목록 조회 (지역별)

```sql
SELECT id, name, shop_type, road_address, latitude, longitude
FROM shops
WHERE verification_status = 'verified'
  AND is_deleted = false
  AND sido = '서울특별시'
  AND sigungu = '강남구'
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

### 3. 태그와 함께 매장 조회

```sql
SELECT
  s.id,
  s.name,
  s.road_address,
  array_agg(t.name ORDER BY t.name) AS tags
FROM shops s
LEFT JOIN shop_tags st ON s.id = st.shop_id
LEFT JOIN tags t ON st.tag_id = t.id AND t.is_deleted = false
WHERE s.is_deleted = false
  AND s.verification_status = 'verified'
GROUP BY s.id, s.name, s.road_address;
```

---

## 관련 테이블

- [tags](./tags.md) - 태그 마스터 테이블
- [shop_tags](./shop_tags.md) - 매장-태그 관계 테이블
- [shop_images](./shop_images.md) - 매장 이미지 테이블
- [shop_owners](./shop_owners.md) - 매장 소유자 관계 테이블
- [admin_users](./admin_users.md) - 관리자 사용자 테이블
- [user_submissions](./user_submissions.md) - 유저 제보 이력 테이블

---

## 최근 변경 사항

### 2025-11-19: shop_type을 배열로 변경
- `shop_type` 컬럼을 `text`에서 `text[]`로 변경
- 다중 선택 가능: `['gacha', 'figure', 'claw']`
- 기존 데이터 마이그레이션: `'both'` → `['gacha', 'figure']`
- CHECK 제약조건 업데이트 및 GIN 인덱스 추가

### 2025-11-14: 메뉴 권한 시스템 추가
- `menus` 테이블과 `admin_menu_permissions` 테이블 추가
- 관리자별 메뉴 접근 권한 동적 제어 가능

### 2025-11-13: 주소 구조 업데이트 (Migration: 20251030132014)
- 기존 단일 주소 필드를 상세 주소 구조로 변경
- `sido`, `sigungu`, `road_address`, `jibun_address`, `zone_code`, `building_name`, `address_type` 추가
- Kakao/Naver 주소 API 연동을 위한 구조

### 2025-11-12: 사용자 테이블 분리 (Migrations: 20251112063454 ~ 20251112075833)
- `users` 테이블을 `general_users`와 `admin_users`로 분리
- `admin_users`에 승인 상태 시스템 추가 (`approval_status`)
- 소셜 로그인 (general) vs 이메일 로그인 (admin) 명확히 구분

### 2025-11-01: tags 컬럼 → 별도 테이블 분리 (Migration: 20251101075550)
- `tags` text[] 컬럼 제거
- `tags` 테이블과 `shop_tags` 중간 테이블로 정규화
- 태그를 중앙에서 일관성 있게 관리 가능

### 2025-11-01: SNS URLs 지원 (Migration: 20251101064529)
- `website_url` → `social_urls` (jsonb)로 변경
- 여러 SNS 플랫폼 URL 저장 가능

---

## 주의사항

1. **소프트 삭제 사용**: 레코드를 완전히 삭제하지 않고 `is_deleted = true`로 표시
2. **RLS 활성화**: 직접 SQL 쿼리 시 RLS 정책 고려 필요
3. **외래 키 제약**: `verified_by`는 `admin_users.id`를 참조
4. **created_by/updated_by**: `auth.users.id`를 참조 (admin_users와 general_users 모두 포함)
5. **address_type**: 'R' (도로명) 또는 'J' (지번) CHECK 제약조건 있음
