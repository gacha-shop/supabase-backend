/**
 * 유효성 검사 유틸리티
 */

import { ValidationError } from './errors.ts';
import type { ShopCreateInput } from '../types/shop.types.ts';

/**
 * UUID 형식 검증
 */
export function isValidUUID(uuid: string): boolean {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Shop 생성 입력값 검증
 */
export function validateShopInput(input: ShopCreateInput): void {
  // 필수 필드 검증
  if (!input.name || input.name.trim().length === 0) {
    throw new ValidationError('Shop name is required');
  }

  if (!input.road_address || input.road_address.trim().length === 0) {
    throw new ValidationError('Road address is required');
  }

  if (!input.sido || input.sido.trim().length === 0) {
    throw new ValidationError('Sido (city/province) is required');
  }

  // shop_type은 배열이므로 배열 검증
  if (!input.shop_type || !Array.isArray(input.shop_type) || input.shop_type.length === 0) {
    throw new ValidationError('Shop type is required (at least one type must be selected)');
  }

  // 유효한 shop_type 값들만 허용
  const validShopTypes = ['gacha', 'figure', 'claw'];
  const invalidTypes = input.shop_type.filter(type => !validShopTypes.includes(type));
  if (invalidTypes.length > 0) {
    throw new ValidationError(`Invalid shop types: ${invalidTypes.join(', ')}. Allowed: ${validShopTypes.join(', ')}`);
  }

  // 좌표 검증 (한국 범위)
  if (input.latitude !== undefined && input.latitude !== null) {
    if (input.latitude < 33 || input.latitude > 43) {
      throw new ValidationError('Invalid latitude for Korea (33-43)');
    }
  }

  if (input.longitude !== undefined && input.longitude !== null) {
    if (input.longitude < 124 || input.longitude > 132) {
      throw new ValidationError('Invalid longitude for Korea (124-132)');
    }
  }

  // 가챠 기계 수 검증
  if (
    input.gacha_machine_count !== undefined &&
    input.gacha_machine_count !== null
  ) {
    if (input.gacha_machine_count < 0 || input.gacha_machine_count > 1000) {
      throw new ValidationError(
        'Gacha machine count must be between 0 and 1000'
      );
    }
  }

  // 이름 길이 검증
  if (input.name.length > 100) {
    throw new ValidationError('Shop name must be less than 100 characters');
  }

  // 전화번호 형식 검증 (선택사항)
  if (input.phone) {
    const phoneRegex = /^[0-9-+() ]+$/;
    if (!phoneRegex.test(input.phone)) {
      throw new ValidationError('Invalid phone number format');
    }
  }
}

/**
 * 역할 검증
 */
export function validateRole(
  userRole: string,
  allowedRoles: string[]
): void {
  if (!allowedRoles.includes(userRole)) {
    throw new ValidationError(
      `Requires one of the following roles: ${allowedRoles.join(', ')}`
    );
  }
}

/**
 * 이메일 형식 검증
 */
export function validateEmail(email: string): void {
  if (!email || email.trim().length === 0) {
    throw new ValidationError('Email is required');
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new ValidationError('Invalid email format');
  }

  if (email.length > 255) {
    throw new ValidationError('Email must be less than 255 characters');
  }
}

/**
 * 비밀번호 검증
 */
export function validatePassword(password: string): void {
  if (!password || password.length === 0) {
    throw new ValidationError('Password is required');
  }

  if (password.length < 8) {
    throw new ValidationError('Password must be at least 8 characters');
  }

  if (password.length > 72) {
    throw new ValidationError('Password must be less than 72 characters');
  }

  // 최소 1개의 영문, 1개의 숫자 포함 (선택사항, 필요시 활성화)
  // const hasLetter = /[a-zA-Z]/.test(password);
  // const hasNumber = /[0-9]/.test(password);
  // if (!hasLetter || !hasNumber) {
  //   throw new ValidationError('Password must contain at least one letter and one number');
  // }
}

/**
 * 이름 검증
 */
export function validateFullName(fullName: string): void {
  if (!fullName || fullName.trim().length === 0) {
    throw new ValidationError('Full name is required');
  }

  if (fullName.trim().length < 2) {
    throw new ValidationError('Full name must be at least 2 characters');
  }

  if (fullName.length > 100) {
    throw new ValidationError('Full name must be less than 100 characters');
  }
}

/**
 * 전화번호 검증 (한국 형식)
 */
export function validatePhoneNumber(phone: string): void {
  if (!phone || phone.trim().length === 0) {
    throw new ValidationError('Phone number is required');
  }

  // 한국 전화번호 형식: 010-1234-5678, 02-123-4567 등
  const phoneRegex = /^[0-9-+() ]{9,20}$/;
  if (!phoneRegex.test(phone)) {
    throw new ValidationError('Invalid phone number format');
  }
}
