# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Gacha store backend built with Supabase (PostgreSQL + Edge Functions) for a platform managing gacha shops, users, and submissions. The project uses a hybrid architecture combining Supabase Auth for authentication with Edge Functions for business logic.

## Development Commands

### Local Development
```bash
# Start Supabase locally
supabase start

# Deploy a specific edge function
supabase functions deploy <function-name>

# Deploy all edge functions
supabase functions deploy

# View logs for a function
supabase functions logs <function-name>

# Stop local Supabase
supabase stop
```

### Database
```bash
# Create a new migration
supabase migration new <migration-name>

# Apply migrations locally
supabase db reset

# Push schema changes to remote
supabase db push
```

## Architecture

### Hybrid Auth Architecture

**Supabase Auth** handles:
- JWT token issuance and validation
- Password hashing (more secure than bcrypt)
- Email verification
- Session management

**Edge Functions** handle:
- Business logic validation
- Role-based authorization (super_admin, admin, owner, general_user)
- Audit logging
- Custom workflows (e.g., owner-shop linking)

This separation allows 85-90% code reuse when migrating to a custom server.

### User Types & Roles

1. **admin_users table**: super_admin, admin, owner
   - Requires approval_status='approved' and status='active'
   - Owner role links to specific shop via shop_owners table

2. **general_users table**: Regular users
   - Can submit shop suggestions (verification_status='pending')
   - Can view verified shops only

### Layered Architecture

```
Edge Function (HTTP Handler - 10%)
    ↓
Service Layer (Business Logic - 90% reusable)
    ↓
Repository Layer (Database Access)
    ↓
PostgreSQL (Minimal RLS policies)
```

**Key principle**: Service layer contains reusable business logic. Edge functions are thin HTTP wrappers. This enables easy migration to Express/Fastify/etc.

## Code Organization

```
supabase/functions/
├── _shared/                    # Shared code across functions
│   ├── auth/
│   │   └── middleware.ts       # JWT validation + user lookup
│   ├── services/               # Business logic (90% reusable)
│   │   ├── auth.service.ts
│   │   ├── shop.service.ts
│   │   └── user-submission.service.ts
│   ├── repositories/           # Database access
│   │   ├── admin-user.repository.ts
│   │   └── shop.repository.ts
│   ├── types/                  # TypeScript interfaces
│   └── utils/                  # Helpers (validation, errors, CORS)
│
├── admin-*/                    # Admin endpoints (require admin/super_admin)
├── owner-*/                    # Owner endpoints (require owner role)
└── general-*/                  # General user endpoints
```

## Authentication & Authorization

### Authentication Flow

1. Edge function receives request with `Authorization: Bearer <token>` header
2. `authenticate()` middleware (in `_shared/auth/middleware.ts`):
   - Extracts JWT token
   - Validates with Supabase Auth
   - Looks up user in admin_users OR general_users table
   - Checks status and approval_status
   - Returns AuthUser object with role information

3. Service layer uses AuthUser for authorization decisions

### Authorization Patterns

**In middleware.ts**:
- `authenticate()` - Validates JWT and returns user
- `requireRole()` - Checks if user has one of allowed roles
- `requireAdmin()` - Shorthand for super_admin or admin
- `requireOwner()` - Checks owner role

**In service classes**:
```typescript
class ShopService {
  constructor(private currentUser: AuthUser) {}

  async createShop() {
    this.requireRole(['super_admin', 'admin']);
    // Business logic
  }

  async updateMyShop(shopId: string) {
    this.requireRole(['owner']);
    await this.verifyOwnership(shopId); // Check shop_owners table
    // Business logic
  }
}
```

## Database Access Patterns

### Use Service Role Key in Repositories

Repositories use `SUPABASE_SERVICE_ROLE_KEY` to bypass RLS. Authorization is handled in the service layer, not via RLS policies.

```typescript
class ShopRepository {
  private supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );
}
```

### RLS Policies

RLS is used as a safety net only, not for primary authorization. The codebase prefers explicit authorization checks in service code over complex RLS policies.

## Key Patterns

### 1. Shop Verification Workflow

- Admin creates shop → `verification_status='verified'` immediately
- General user submits shop → `verification_status='pending'`
- Admin reviews → updates to 'verified' or 'rejected'

### 2. Owner Shop Management

Owners can only manage their own shop:
1. Check `shop_owners` table for `owner_id` and `verified=true`
2. Verify ownership before any update operation
3. Restrict editable fields to: description, phone, business_hours, etc.

### 3. Audit Logging

Use `AuditService` for tracking important actions:
```typescript
await this.auditService.log(
  'admin_signup',
  'admin_users',
  userId,
  { role: 'admin', email: 'user@example.com' }
);
```

### 4. Error Handling

Use typed errors from `_shared/utils/errors.ts`:
- `UnauthorizedError` - 401
- `ForbiddenError` - 403
- `NotFoundError` - 404
- `ValidationError` - 400

Return errors consistently:
```typescript
return createErrorResponse(error, statusCode);
```

## Migration Strategy

The codebase is designed for future migration to a custom server:

**High reusability (90%+)**:
- Service layer logic
- Repository patterns (Supabase Client → Prisma/Knex)
- Validation utilities
- Type definitions

**Needs replacement (10%)**:
- Edge function HTTP handlers → Express/Fastify routes
- Supabase Auth calls → Custom JWT implementation

Example migration path documented in `docs/database/AUTH_HYBRID_ARCHITECTURE.md`.

## Important Notes

1. **Always use Service Layer**: Put business logic in services, not in edge function handlers or RLS policies.

2. **Two Supabase Clients**:
   - Service Role Key: For repository layer (bypasses RLS)
   - Anon Key: For auth operations that need session creation (in auth.service.ts)

3. **Owner Role Special Case**: Owners are in admin_users table but also have entry in shop_owners junction table linking to their shop.

4. **Approval Workflow**: New admin/owner signups require super_admin approval via approval_status field.

5. **Database Functions**: Some operations use PostgreSQL functions (RPCs) like `create_admin_user` and `create_shop_owner` for complex transactions.

## Testing Approach

When adding features:
1. Write service layer logic first
2. Add repository methods if needed
3. Create thin edge function wrapper
4. Test authorization paths (different user roles)
5. Verify audit logging works

## Common Tasks

### Adding a new admin endpoint

1. Create service method in appropriate service file
2. Add authorization check (`requireRole()`)
3. Create edge function in `admin-<resource>-<action>/index.ts`
4. Call service method from edge function
5. Deploy: `supabase functions deploy admin-<resource>-<action>`

### Adding a new database table

1. Create migration: `supabase migration new add_<table>`
2. Define table schema with timestamps, soft delete, audit fields
3. Add minimal RLS policy for service role
4. Create TypeScript types in `_shared/types/`
5. Create repository in `_shared/repositories/`
6. Create service in `_shared/services/`

### Debugging authorization issues

1. Check JWT token is valid (test with Supabase dashboard)
2. Verify user exists in admin_users or general_users
3. Check status='active' and approval_status='approved' (for admins)
4. Review role requirements in service method
5. For owners, verify shop_owners entry exists with verified=true
