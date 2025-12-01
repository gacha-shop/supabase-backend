# 유저 서비스 로그인 구현 가이드

## 개요

일반 사용자(General Users)를 위한 소셜 로그인 및 인증/인가 시스템 구현

### 설계 원칙
- ✅ **Edge Function 중심 설계**: Supabase 종속성 최소화, 확장성 우선
- ✅ **비즈니스 로직 중앙화**: DB Trigger 대신 Edge Function에서 처리
- ✅ **이식성**: 다른 인증 서비스(Firebase, AWS Cognito)로 전환 용이

---

## 아키텍처

### 로그인 플로우

```
[클라이언트]
    ↓
1. 소셜 로그인 (Kakao/Google/Apple)
    ↓
2. Supabase Auth 세션 생성 (자동)
   → auth.users 테이블에 저장
    ↓
3. Edge Function 호출: /user/auth-callback
   → JWT 토큰 포함하여 요청
    ↓
4. general_users 존재 확인
   - 없으면 → 신규 생성 (임시 닉네임/아바타)
   - 있으면 → 기존 정보 반환
    ↓
5. JWT 토큰으로 이후 API 호출
```

### 데이터베이스 구조

```
auth.users (Supabase Auth 관리)
  ├─ id (PK)
  ├─ email
  ├─ raw_app_meta_data (provider 정보)
  └─ raw_user_meta_data (provider_id 등)
       ↓ (FK)
public.general_users (일반 사용자 정보)
  ├─ id (PK, FK → auth.users.id)
  ├─ email
  ├─ nickname (2-20자, unique)
  ├─ avatar_url
  ├─ bio
  ├─ provider (kakao/google/apple)
  ├─ provider_id
  ├─ status (active/suspended/deleted)
  └─ ... (기타 사용자 정보)
```

---

## 구현 내용

### 1. 타입 정의 (_shared/types.ts)

추가된 타입:
- `GeneralUserStatus`: 'active' | 'suspended' | 'deleted'
- `OAuthProvider`: 'kakao' | 'google' | 'apple'
- `GeneralUser`: 일반 사용자 인터페이스
- `GeneralUserContext`: 일반 사용자 인증 컨텍스트

### 2. 인증 미들웨어 (_shared/auth.ts)

새로 추가된 함수:

#### `getGeneralUser(supabase, userId)`
- general_users 테이블에서 사용자 조회
- status = 'active' 필터링
- PGRST116 에러 처리 (사용자 없음)

#### `requireGeneralUserAuth(supabase)`
- 일반 사용자 인증 필수
- JWT 검증 + general_users 존재 확인
- `GeneralUserContext` 반환
- 사용자 없을 시 404 에러

### 3. Edge Functions

#### A. `/user/auth-callback`
**용도**: 소셜 로그인 후 general_users 생성/조회

**HTTP Method**: POST

**Request Headers**:
```
Authorization: Bearer <JWT_TOKEN>
```

**Response** (신규 사용자):
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "nickname": "user_12345678",
    "avatar_url": "/avatars/default.png",
    "provider": "kakao",
    "status": "active",
    "created_at": "2025-01-01T00:00:00Z"
  },
  "isNewUser": true
}
```

**Response** (기존 사용자):
```json
{
  "user": { ... },
  "isNewUser": false
}
```

**특징**:
- UPSERT 사용으로 race condition 방지
- 임시 닉네임: `user_{uuid_prefix}`
- 임시 아바타: `/avatars/default.png`
- TODO: 랜덤 캐릭터 닉네임/아바타 생성 로직 추가 예정

---

#### B. `/user/my-profile`
**용도**: 현재 로그인한 사용자의 프로필 조회/수정

**GET - 프로필 조회**

Request Headers:
```
Authorization: Bearer <JWT_TOKEN>
```

Response:
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "nickname": "귀여운피카츄",
    "avatar_url": "/avatars/pikachu.png",
    "bio": "가챠 수집 중",
    "level": 5,
    "experience_points": 1250
  }
}
```

**PUT - 프로필 수정**

Request Headers:
```
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
```

Request Body:
```json
{
  "nickname": "멋진이브이",
  "bio": "가챠 마스터",
  "avatar_url": "/avatars/eevee.png"
}
```

**수정 가능한 필드**:
- `nickname` (2-20자, unique)
- `full_name`
- `avatar_url`
- `bio`
- `notification_settings`

**Validation**:
- 닉네임 길이: 2-20자
- 닉네임 중복 시 409 Conflict 에러

---

## RLS 정책 (Row Level Security)

### general_users 테이블

| 정책명 | 작업 | 조건 |
|--------|------|------|
| Users can view own profile | SELECT | `auth.uid() = id` |
| Users can insert own profile | INSERT | `auth.uid() = id` |
| Users can update own profile | UPDATE | `auth.uid() = id` |
| Admins can view all general users | SELECT | admin_users 존재 확인 |
| Admins can update any general user | UPDATE | admin_users 존재 확인 |

---

## 클라이언트 구현 예시

### 1. 소셜 로그인

```typescript
// Kakao 로그인
const { data, error } = await supabase.auth.signInWithOAuth({
  provider: 'kakao',
  options: {
    redirectTo: 'YOUR_APP_URL/auth/callback'
  }
});
```

### 2. Auth Callback 처리

```typescript
// 로그인 후 콜백 페이지에서
const { data: { session } } = await supabase.auth.getSession();

if (session) {
  // general_users 생성/조회
  const response = await fetch(
    'https://PROJECT_REF.supabase.co/functions/v1/user/auth-callback',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json'
      }
    }
  );

  const { user, isNewUser } = await response.json();

  if (isNewUser) {
    // 신규 사용자 - 프로필 설정 페이지로 이동
    router.push('/profile/setup');
  } else {
    // 기존 사용자 - 메인 페이지로 이동
    router.push('/home');
  }
}
```

### 3. 프로필 조회

```typescript
const { data: { session } } = await supabase.auth.getSession();

const response = await fetch(
  'https://PROJECT_REF.supabase.co/functions/v1/user/my-profile',
  {
    headers: {
      'Authorization': `Bearer ${session.access_token}`
    }
  }
);

const { user } = await response.json();
console.log(user.nickname); // "user_12345678"
```

### 4. 프로필 수정

```typescript
const { data: { session } } = await supabase.auth.getSession();

const response = await fetch(
  'https://PROJECT_REF.supabase.co/functions/v1/user/my-profile',
  {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      nickname: '귀여운피카츄',
      avatar_url: '/avatars/pikachu.png',
      bio: '가챠 수집가'
    })
  }
);

const { user } = await response.json();
```

---

## 인가(Authorization) 사용 예시

### 일반 사용자만 접근 가능한 API

```typescript
// supabase/functions/user/my-favorites/index.ts
import { requireGeneralUserAuth } from '../../_shared/auth.ts';

Deno.serve(async (req) => {
  const supabase = createSupabaseClient(req.headers.get('Authorization'));

  // 일반 사용자 인증 필수
  const { context, error } = await requireGeneralUserAuth(supabase);
  if (error || !context) return error;

  // context.user는 GeneralUser 타입
  const userId = context.user.id;

  // 사용자의 즐겨찾기 조회
  const { data } = await supabase
    .from('favorites')
    .select('*')
    .eq('user_id', userId);

  return createJsonResponse({ favorites: data });
});
```

---

## 에러 핸들링

### 인증 에러

| 상태 코드 | 메시지 | 원인 |
|-----------|--------|------|
| 401 | Unauthorized | JWT 토큰 없음/만료 |
| 403 | User not found or inactive | general_users에 없거나 status != 'active' |
| 404 | User profile not found | general_users 미등록 (auth-callback 호출 필요) |

### 프로필 수정 에러

| 상태 코드 | 메시지 | 원인 |
|-----------|--------|------|
| 400 | Nickname must be between 2 and 20 characters | 닉네임 길이 오류 |
| 409 | Nickname is already taken | 닉네임 중복 |
| 500 | Failed to update profile | DB 에러 |

---

## 향후 개선 사항 (TODO)

### 1. 랜덤 닉네임 생성
```typescript
// 현재 (임시)
function generateTempNickname(userId: string): string {
  return `user_${userId.substring(0, 8)}`;
}

// 향후 개선
function generateRandomNickname(): string {
  const adjectives = ['귀여운', '멋진', '행복한', '신나는'];
  const characters = ['피카츄', '이브이', '꼬부기', '파이리'];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const char = characters[Math.floor(Math.random() * characters.length)];
  return `${adj} ${char}`;
}
```

### 2. 랜덤 아바타 생성
```typescript
// 외부 API 사용
async function generateRandomAvatar(userId: string): Promise<string> {
  const response = await fetch(
    `https://api.dicebear.com/7.x/avatars/svg?seed=${userId}`
  );
  // Supabase Storage에 업로드 후 URL 반환
  return avatarUrl;
}
```

### 3. 인증 후크 (Optional)
```typescript
// Supabase Auth 후크로 자동화 가능 (Database Webhook)
// Edge Function 방식 유지하며 보조 수단으로 활용
```

---

## 테스트

### 로컬 테스트

```bash
# Supabase 로컬 시작
supabase start

# Edge Functions 서빙
supabase functions serve

# auth-callback 테스트
curl -X POST 'http://localhost:54321/functions/v1/user/auth-callback' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN'

# my-profile 조회
curl 'http://localhost:54321/functions/v1/user/my-profile' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN'

# my-profile 수정
curl -X PUT 'http://localhost:54321/functions/v1/user/my-profile' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"nickname": "테스트유저", "bio": "테스트 중"}'
```

---

## 마이그레이션

### 적용된 마이그레이션

**파일**: `add_general_users_admin_policy`

내용:
- Admin이 모든 general_users 조회 가능 (SELECT)
- Admin이 모든 general_users 수정 가능 (UPDATE, 관리 목적)

---

## 확장성 고려사항

### Supabase → 다른 서비스 전환 시

**변경 필요 영역**:
1. `_shared/supabaseClient.ts` - 클라이언트 생성 로직만 교체
2. `_shared/auth.ts` - `authenticateUser()` 함수만 수정
3. Edge Function 내 쿼리 부분 - ORM/Query Builder 교체

**변경 불필요 영역** (비즈니스 로직 보존):
- 닉네임/아바타 생성 로직
- 프로필 수정 validation
- API 응답 구조
- 클라이언트 플로우

---

## 요약

✅ **구현 완료**:
1. `_shared/types.ts` - GeneralUser 타입 추가
2. `_shared/auth.ts` - requireGeneralUserAuth() 추가
3. `/user/auth-callback` - 소셜 로그인 후 사용자 생성/조회
4. `/user/my-profile` - 프로필 조회/수정
5. RLS 정책 - 사용자/Admin 권한 설정

✅ **설계 원칙 준수**:
- Edge Function 중심 설계
- Supabase 종속성 최소화
- 비즈니스 로직 명확화
- 테스트 용이성

✅ **다음 단계**:
- 프론트엔드 통합
- 랜덤 닉네임/아바타 생성 로직 개선
- 프로필 이미지 업로드 기능 추가
