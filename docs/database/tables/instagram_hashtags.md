# Instagram Hashtags Table Schema

## 개요
Instagram 해시태그 정보를 관리하는 테이블

## 테이블 정보
- **테이블명**: `instagram_hashtags`
- **스키마**: `public`
- **설명**: Instagram Graph API를 통해 등록된 해시태그 정보 저장
- **접근 방식**: Edge Function을 통한 접근만 허용 (RLS 비활성화)
- **권한 관리**: Edge Function의 auth middleware에서 super_admin/admin 권한 체크

## 주요 용도
- 해시태그 기반 미디어 검색 (recent_media API)
- 활성화된 해시태그만 필터링하여 유저 서비스/피드 관리에 활용
- 7일 제한 관리 (Instagram API 정책: 7일 동안 최대 30개 고유 해시태그)

---

## 스키마

| 컬럼명 | 타입 | 제약조건 | 기본값 | 설명 |
|--------|------|----------|--------|------|
| id | uuid | PRIMARY KEY | gen_random_uuid() | 해시태그 고유 ID |
| keyword | text | NOT NULL | - | 해시태그 키워드 (예: "fashion", "travel") |
| hashtag_id | text | NOT NULL, UNIQUE | - | Instagram Graph API에서 반환된 해시태그 ID |
| is_active | boolean | NOT NULL | true | 활성화 여부 (true: 활성화, false: 비활성화) |
| created_at | timestamptz | NOT NULL | now() | 생성 일시 (7일 제한 계산 기준) |
| updated_at | timestamptz | NOT NULL | now() | 수정 일시 |
| created_by | uuid | FOREIGN KEY | - | 생성자 (admin_users.id) |
| updated_by | uuid | FOREIGN KEY | - | 수정자 (admin_users.id) |

---

## 외래 키 (Foreign Keys)

| 제약조건명 | 소스 컬럼 | 참조 테이블 | 참조 컬럼 | 설명 |
|-----------|-----------|------------|----------|------|
| `instagram_hashtags_created_by_fkey` | created_by | admin_users | id | 생성자 |
| `instagram_hashtags_updated_by_fkey` | updated_by | admin_users | id | 수정자 |

---

## 인덱스

```sql
-- 활성화된 해시태그 조회 최적화
CREATE INDEX idx_instagram_hashtags_is_active
ON instagram_hashtags(is_active)
WHERE is_active = true;

-- 생성일 기준 조회 (7일 제한 체크용)
CREATE INDEX idx_instagram_hashtags_created_at
ON instagram_hashtags(created_at DESC);

-- 키워드 검색 최적화
CREATE INDEX idx_instagram_hashtags_keyword
ON instagram_hashtags USING gin(keyword gin_trgm_ops);
```

---

## 트리거

```sql
-- updated_at 자동 갱신
CREATE TRIGGER set_updated_at
BEFORE UPDATE ON instagram_hashtags
FOR EACH ROW
EXECUTE FUNCTION trigger_set_updated_at();
```

---

## 제약사항

### 1. 7일 제한 관리
- **Instagram API 정책**: 7일 동안 최대 30개의 고유한 해시태그 쿼리 가능
- `created_at` 기준으로 **클라이언트에서** 7일 경과 여부 표시
- DB에는 별도 상태 저장하지 않음 (클라이언트 계산)

### 2. 활성화/비활성화
- `is_active` 필드로 관리
- 비활성화된 해시태그는 유저 서비스/피드 관리에서 조회 제외
- 7일 제한과는 독립적으로 관리

### 3. 수정 불가
- 해시태그 키워드 및 ID는 수정 불가
- 활성화/비활성화 토글만 가능 (UPDATE)

---

## 사용 예시

### 활성화된 해시태그 조회
```sql
SELECT * FROM instagram_hashtags
WHERE is_active = true
ORDER BY created_at DESC;
```

### 7일 이내 등록된 해시태그 조회
```sql
SELECT * FROM instagram_hashtags
WHERE created_at > NOW() - INTERVAL '7 days'
ORDER BY created_at DESC;
```

### 활성화된 + 7일 이내 해시태그 개수 확인
```sql
SELECT COUNT(*) FROM instagram_hashtags
WHERE is_active = true
AND created_at > NOW() - INTERVAL '7 days';
```

### 해시태그 등록 (Edge Function에서 사용)
```sql
INSERT INTO instagram_hashtags (keyword, hashtag_id, created_by)
VALUES ('fashion', '17843826142345678', '관리자_UUID')
RETURNING *;
```

### 활성화/비활성화 토글
```sql
UPDATE instagram_hashtags
SET
  is_active = NOT is_active,
  updated_by = '관리자_UUID',
  updated_at = NOW()
WHERE id = '해시태그_UUID'
RETURNING *;
```

---

## 연관 API

### Instagram Graph API

#### 1. 해시태그 검색
```
GET https://graph.facebook.com/v24.0/ig_hashtag_search
```
**Parameters:**
- `user_id`: Instagram Business Account ID
- `q`: 검색 키워드 (예: "fashion")
- `access_token`: Instagram Access Token

**Response:**
```json
{
  "data": [
    {
      "id": "17843826142345678"
    }
  ]
}
```

#### 2. 최근 미디어 조회 (향후 사용 예정)
```
GET https://graph.facebook.com/v24.0/{hashtag_id}/recent_media
```
**Parameters:**
- `user_id`: Instagram Business Account ID
- `fields`: 조회할 필드 (예: "id,media_type,media_url,permalink")
- `access_token`: Instagram Access Token

---

## Edge Functions

### 예상 Edge Function 목록
- `instagram-hashtags-list` - 해시태그 목록 조회 (GET)
- `instagram-hashtags-create` - 해시태그 등록 (POST)
- `instagram-hashtags-toggle` - 활성화/비활성화 토글 (PATCH)
- `instagram-hashtags-delete` - 해시태그 삭제 (DELETE)

---

## 클라이언트 로직

### 7일 경과 여부 계산
```typescript
function isExpiredHashtag(createdAt: string): boolean {
  const created = new Date(createdAt);
  const now = new Date();
  const diffInDays = (now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);
  return diffInDays > 7;
}
```

### 등록 가능 개수 확인
```typescript
function canAddMoreHashtags(hashtags: InstagramHashtag[]): boolean {
  const activeWithin7Days = hashtags.filter(
    (h) => !isExpiredHashtag(h.created_at)
  );
  return activeWithin7Days.length < 30;
}
```

---

## Migration

마이그레이션 파일: `supabase/migrations/YYYYMMDDHHMMSS_create_instagram_hashtags_table.sql`

---

## 참고사항

### Instagram Credentials 관리
- **저장 위치**: localStorage (키: `instagram_credentials`)
- **구조**:
  ```typescript
  {
    access_token: string;
    user_id: string; // Instagram Business Account ID
  }
  ```
- **Refresh Token**: 추후 개발 예정
- **현재 방식**: 수동으로 localStorage에 credential 설정 필요

### 보안 고려사항
1. **Edge Function 권한 체크**: `requireAdmin()` 사용
2. **RLS 비활성화**: Edge Function을 통해서만 접근
3. **Access Token**: 클라이언트에서 관리 (향후 서버 저장 고려)

---

## 최근 변경 사항

### 2025-11-19: 테이블 생성
- Instagram 해시태그 관리 기능 추가
- 7일/30개 제한 관리 지원
- 활성화/비활성화 토글 기능
