# Instagram Credentials Table Schema

## 개요
Instagram Graph API 인증 정보를 저장하는 테이블

## 테이블 정보
- **테이블명**: `instagram_credentials`
- **스키마**: `public`
- **설명**: Instagram Access Token 및 Business Account 정보를 암호화하여 저장
- **접근 방식**: Edge Function을 통한 접근만 허용 (RLS 비활성화)
- **권한 관리**: super_admin만 업데이트 가능

## 주요 용도
- Instagram Graph API 호출 시 사용할 Access Token 관리
- 관리자가 수동으로 발급받은 Access Token을 서버에 저장
- Edge Function에서 암호화된 토큰을 복호화하여 Instagram API 호출

---

## 스키마

| 컬럼명 | 타입 | 제약조건 | 기본값 | 설명 |
|--------|------|----------|--------|------|
| id | uuid | PRIMARY KEY | gen_random_uuid() | 레코드 고유 ID |
| access_token | text | NOT NULL | - | Instagram Access Token (암호화 저장) |
| user_id | text | NOT NULL | - | Instagram Business Account ID |
| token_type | text | NOT NULL | 'user' | 토큰 타입 (user/page) |
| expires_at | timestamptz | - | null | 토큰 만료 시각 (장기 토큰: 60일) |
| is_active | boolean | NOT NULL | true | 활성화 여부 |
| created_at | timestamptz | NOT NULL | now() | 생성 일시 |
| updated_at | timestamptz | NOT NULL | now() | 수정 일시 |
| created_by | uuid | FOREIGN KEY | - | 생성자 (admin_users.id) |
| updated_by | uuid | FOREIGN KEY | - | 수정자 (admin_users.id) |

---

## 외래 키 (Foreign Keys)

| 제약조건명 | 소스 컬럼 | 참조 테이블 | 참조 컬럼 | 설명 |
|-----------|-----------|------------|----------|------|
| `instagram_credentials_created_by_fkey` | created_by | admin_users | id | 생성자 |
| `instagram_credentials_updated_by_fkey` | updated_by | admin_users | id | 수정자 |

---

## 인덱스

```sql
-- 활성화된 credential 조회 (단일 레코드만 활성화)
CREATE UNIQUE INDEX idx_instagram_credentials_active
ON instagram_credentials(is_active)
WHERE is_active = true;
```

---

## 트리거

```sql
-- updated_at 자동 갱신
CREATE TRIGGER set_updated_at
BEFORE UPDATE ON instagram_credentials
FOR EACH ROW
EXECUTE FUNCTION trigger_set_updated_at();
```

---

## 제약사항

### 1. 단일 활성 Credential
- `is_active = true`인 레코드는 **항상 1개만** 존재
- UNIQUE INDEX를 통해 보장
- 새 토큰 등록 시 기존 활성 토큰은 자동으로 비활성화

### 2. Access Token 암호화
- **암호화 방식**: Supabase Vault 또는 환경변수 기반 암호화
- **복호화 시점**: Edge Function에서 Instagram API 호출 직전
- **저장 형식**: 암호화된 문자열

### 3. 토큰 만료 관리
- **장기 토큰**: 60일 만료
- **만료 알림**: 클라이언트에서 `expires_at` 기준으로 만료 임박 표시
- **Refresh Token**: 추후 자동 갱신 기능 구현 예정

---

## 사용 예시

### 활성 Credential 조회 (Edge Function)
```sql
SELECT
  access_token,
  user_id,
  expires_at
FROM instagram_credentials
WHERE is_active = true
LIMIT 1;
```

### Credential 업데이트 (Upsert)
```sql
-- 기존 활성 credential 비활성화
UPDATE instagram_credentials
SET is_active = false
WHERE is_active = true;

-- 새 credential 추가
INSERT INTO instagram_credentials (
  access_token,
  user_id,
  token_type,
  expires_at,
  created_by
)
VALUES (
  'ENCRYPTED_TOKEN',
  '17841234567890123',
  'user',
  NOW() + INTERVAL '60 days',
  '관리자_UUID'
)
RETURNING *;
```

### 만료 임박 토큰 확인
```sql
SELECT
  id,
  expires_at,
  (expires_at - NOW()) AS remaining_time
FROM instagram_credentials
WHERE is_active = true
AND expires_at < NOW() + INTERVAL '7 days';
```

---

## Edge Functions

### instagram-credentials-upsert
**목적**: Access Token 업데이트
**권한**: super_admin만 가능
**동작**:
1. 관리자 인증 및 super_admin 체크
2. 기존 활성 credential 비활성화
3. 새 credential 추가 (암호화)
4. 성공/실패 응답

```typescript
// Request
POST /instagram-credentials-upsert
{
  "access_token": "IGQW...",
  "user_id": "17841234567890123",
  "expires_in": 5184000 // 60일 (초 단위)
}

// Response
{
  "success": true,
  "credential": {
    "id": "uuid",
    "expires_at": "2025-01-18T12:00:00Z",
    "is_active": true
  }
}
```

### instagram-credentials-get
**목적**: 현재 활성 credential 정보 조회 (토큰 제외)
**권한**: admin 이상
**동작**:
1. 활성 credential의 메타데이터만 반환
2. access_token은 반환하지 않음 (보안)

```typescript
// Response
{
  "user_id": "17841234567890123",
  "expires_at": "2025-01-18T12:00:00Z",
  "days_remaining": 45,
  "is_expiring_soon": false
}
```

---

## 클라이언트 로직

### Credential 설정 UI
```typescript
interface InstagramCredential {
  access_token: string;
  user_id: string;
  expires_in?: number; // 초 단위 (기본: 5184000 = 60일)
}

async function updateInstagramCredential(credential: InstagramCredential) {
  const response = await fetch('/instagram-credentials-upsert', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(credential)
  });

  if (!response.ok) {
    throw new Error('Failed to update credential');
  }

  return response.json();
}
```

### 만료 알림
```typescript
function isTokenExpiringSoon(expiresAt: string): boolean {
  const expires = new Date(expiresAt);
  const now = new Date();
  const daysRemaining = (expires.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  return daysRemaining <= 7;
}
```

---

## 보안 고려사항

### 1. Access Token 암호화
**방법 1: Supabase Vault (추천)**
```sql
-- 저장 시
INSERT INTO instagram_credentials (access_token, ...)
VALUES (
  vault.create_secret('실제_토큰_값', 'instagram-token'),
  ...
);

-- 조회 시 (Edge Function)
SELECT vault.decrypt_secret(access_token) as decrypted_token
FROM instagram_credentials
WHERE is_active = true;
```

**방법 2: 환경변수 기반 암호화**
```typescript
// Edge Function에서
import { encrypt, decrypt } from './crypto.ts';

// 저장 시
const encrypted = await encrypt(accessToken, Deno.env.get('ENCRYPTION_KEY'));

// 사용 시
const decrypted = await decrypt(encryptedToken, Deno.env.get('ENCRYPTION_KEY'));
```

### 2. 권한 제어
- **업데이트**: super_admin만 가능
- **조회**: admin 이상 가능 (메타데이터만)
- **삭제**: super_admin만 가능

### 3. 감사 로그
- 모든 credential 업데이트 이력 기록
- `created_by`, `updated_by`로 추적

---

## Instagram Access Token 발급 방법

### 수동 발급 절차
1. Meta Developers Console 접속
2. Facebook 앱 생성 및 Instagram Basic Display API 설정
3. Instagram Business Account 연결
4. Access Token 발급 (단기 토큰)
5. 장기 토큰으로 교환 (60일)
6. Admin UI에서 토큰 등록

### 토큰 교환 API
```bash
# 단기 → 장기 토큰 교환
curl -X GET "https://graph.facebook.com/v24.0/oauth/access_token?\
grant_type=fb_exchange_token&\
client_id={app-id}&\
client_secret={app-secret}&\
fb_exchange_token={short-lived-token}"
```

---

## 향후 개선 사항

### 1. Refresh Token 자동 갱신
- 만료 7일 전 자동으로 토큰 갱신
- Cron job 또는 Supabase Edge Function 스케줄러 활용

### 2. 다중 Account 지원
- 여러 Instagram Business Account 관리
- Account별 credential 분리

### 3. 토큰 Health Check
- 주기적으로 토큰 유효성 검증
- 만료되거나 revoke된 토큰 자동 감지

---

## 최근 변경 사항

### 2025-11-19: 테이블 생성
- Instagram Access Token 서버 저장 기능 추가
- 암호화 저장 구조 설계
- 단일 활성 credential 제약 추가
