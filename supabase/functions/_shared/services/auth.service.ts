/**
 * Auth Service
 * 하이브리드 아키텍처: Supabase Auth (JWT) + Edge Function (비즈니스 로직)
 *
 * ✅ Supabase Auth: JWT 발급/검증, 비밀번호 해싱, 이메일 인증
 * ✅ Edge Function: Admin 검증, Owner 매장 연결, Audit 로그, 환영 이메일
 */

import { createClient } from "jsr:@supabase/supabase-js@2";
import { AdminUserRepository } from "../repositories/admin-user.repository.ts";
import { AuditService } from "./audit.service.ts";
import {
  validateEmail,
  validatePassword,
  validateFullName,
  validatePhoneNumber,
} from "../utils/validation.ts";
import { sendWelcomeEmail } from "../utils/email.ts";
import type {
  SignUpData,
  SignInData,
  AdminUser,
  AuthResponse,
} from "../types/auth.types.ts";

export class AuthService {
  private supabaseAdmin; // Service Role Key (RLS 우회, DB 작업용)
  private supabaseClient; // Anon Key (Auth 작업용)
  private adminUserRepo: AdminUserRepository;
  private auditService: AuditService;

  constructor() {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Service Role Key 클라이언트 (DB 작업용)
    this.supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Anon Key 클라이언트 (Auth 작업용 - 세션 생성 가능)
    this.supabaseClient = createClient(supabaseUrl, supabaseAnonKey);

    this.adminUserRepo = new AdminUserRepository();
    this.auditService = new AuditService();
  }

  /**
   * 회원가입 (Admin/Owner)
   * ✅ Supabase Auth로 JWT 발급
   * ✅ Edge Function으로 비즈니스 로직 처리
   *
   * 마이그레이션 시 90% 재사용 가능
   */
  async signUp(data: SignUpData): Promise<AuthResponse> {
    // 1. 입력 검증 (100% 재사용)
    this.validateSignUpData(data);

    try {
      // 2. Supabase Auth로 유저 생성 (🔄 마이그레이션 시 교체)
      // Admin API 사용 (Service Role Key)
      const { data: authData, error: authError } =
        await this.supabaseAdmin.auth.admin.createUser({
          email: data.email,
          password: data.password,
          email_confirm: true, // 어드민은 이메일 인증 스킵
        });

      if (authError) throw authError;
      if (!authData.user) throw new Error("Failed to create auth user");

      // 3. admin_users 또는 shop_owners 생성 (100% 재사용)
      let adminUser: AdminUser;
      if (data.role === "owner") {
        adminUser = await this.createOwnerUser(authData.user.id, data);
      } else {
        adminUser = await this.createAdminUser(authData.user.id, data);
      }

      // 4. 환영 이메일 발송 (100% 재사용)
      await sendWelcomeEmail(adminUser.email, adminUser.full_name || "");

      // 5. Audit 로그 (100% 재사용)
      await this.auditService.log("admin_signup", "admin_users", adminUser.id, {
        role: adminUser.role,
        email: adminUser.email,
        approval_status: adminUser.approval_status,
      });

      return {
        success: true,
        user: adminUser,
        message:
          "회원가입이 완료되었습니다. 슈퍼 관리자의 승인을 기다려주세요.",
      };
    } catch (error) {
      // 6. 에러 처리 (100% 재사용)
      throw this.handleSignUpError(error);
    }
  }

  /**
   * 로그인
   * ✅ Supabase Auth로 JWT 검증
   * ✅ Edge Function으로 권한 체크
   *
   * 마이그레이션 시 90% 재사용 가능
   */
  async signIn(data: SignInData): Promise<AuthResponse> {
    // 1. 입력 검증 (100% 재사용)
    validateEmail(data.email);
    validatePassword(data.password);

    // 2. Supabase Auth로 로그인 (🔄 마이그레이션 시 교체)
    // ⚠️ 중요: Anon Key 클라이언트 사용 (세션 생성 가능)
    const { data: authData, error: authError } =
      await this.supabaseClient.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      });

    console.log(authData);

    if (authError) {
      throw new Error("이메일 또는 비밀번호가 올바르지 않습니다.");
    }
    if (!authData.user) throw new Error("Authentication failed");

    // 3. admin_users 조회 및 검증 (100% 재사용)
    const adminUser = await this.adminUserRepo.findById(authData.user.id);
    if (!adminUser) {
      // Admin이 아니면 로그아웃
      await this.supabaseClient.auth.signOut();
      throw new Error("관리자 권한이 필요합니다.");
    }

    // 4. 상태 검증 (100% 재사용)
    this.validateAdminUserStatus(adminUser);

    // 5. 로그인 정보 업데이트 (100% 재사용)
    await this.adminUserRepo.updateLastLogin(adminUser.id);

    // 6. Audit 로그 (100% 재사용)
    await this.auditService.log("admin_signin", "admin_users", adminUser.id, {
      email: adminUser.email,
      role: adminUser.role,
    });

    // 7. 세션 데이터 반환 (클라이언트에서 세션 설정용)
    return {
      success: true,
      user: adminUser,
      session: authData.session ? {
        access_token: authData.session.access_token,
        refresh_token: authData.session.refresh_token,
        expires_in: authData.session.expires_in,
        expires_at: authData.session.expires_at,
        token_type: authData.session.token_type,
        user: {
          id: authData.session.user.id,
          email: authData.session.user.email,
        },
      } : undefined,
      message: "로그인 성공",
    };
  }

  // ========== Private Methods (100% 재사용) ==========

  /**
   * 회원가입 입력 검증
   */
  private validateSignUpData(data: SignUpData): void {
    validateEmail(data.email);
    validatePassword(data.password);
    validateFullName(data.full_name);

    if (data.role === "owner") {
      if (!data.shop_id) {
        throw new Error("매장 ID는 필수입니다.");
      }
      if (!data.phone) {
        throw new Error("전화번호는 필수입니다.");
      }
      validatePhoneNumber(data.phone);
    }
  }

  /**
   * Admin 유저 생성
   */
  private async createAdminUser(
    authId: string,
    data: SignUpData
  ): Promise<AdminUser> {
    return await this.adminUserRepo.create({
      id: authId,
      email: data.email,
      full_name: data.full_name,
      role: data.role || "admin",
      status: "active",
      approval_status: "pending", // 슈퍼 관리자 승인 필요
    });
  }

  /**
   * Owner 유저 생성 (shop_owners 테이블)
   */
  private async createOwnerUser(
    authId: string,
    data: SignUpData
  ): Promise<AdminUser> {
    return await this.adminUserRepo.createOwner({
      user_id: authId,
      email: data.email,
      full_name: data.full_name,
      phone: data.phone!,
      shop_id: data.shop_id!,
      business_license: data.business_license,
      business_name: data.business_name,
    });
  }

  /**
   * Admin 유저 상태 검증
   */
  private validateAdminUserStatus(adminUser: AdminUser): void {
    if (adminUser.status !== "active") {
      throw new Error("계정이 비활성화되었습니다. 관리자에게 문의하세요.");
    }

    if (adminUser.approval_status === "pending") {
      throw new Error(
        "계정 승인 대기 중입니다. 슈퍼 관리자의 승인을 기다려주세요."
      );
    }

    if (adminUser.approval_status === "rejected") {
      const reason = adminUser.rejection_reason
        ? `\n사유: ${adminUser.rejection_reason}`
        : "";
      throw new Error(`계정이 거부되었습니다.${reason}`);
    }
  }

  /**
   * 회원가입 에러 처리
   */
  private handleSignUpError(error: unknown): Error {
    if (error instanceof Error) {
      // PostgreSQL 중복 키 에러
      if (
        error.message.includes("duplicate") ||
        error.message.includes("23505")
      ) {
        return new Error("이미 사용 중인 이메일입니다.");
      }

      // Supabase Auth 에러
      if (error.message.includes("User already registered")) {
        return new Error("이미 가입된 이메일입니다.");
      }

      return error;
    }

    return new Error("회원가입 중 오류가 발생했습니다.");
  }
}
