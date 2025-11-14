/**
 * Audit Service
 * 감사 로그 기록
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

export class AuditService {
  private supabase;

  constructor() {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    this.supabase = createClient(supabaseUrl, supabaseServiceKey);
  }

  /**
   * Audit 로그 기록
   */
  async log(
    action: string,
    entityType: string,
    entityId: string,
    changes: Record<string, unknown> = {}
  ): Promise<void> {
    try {
      // audit_logs 테이블이 있다면 기록
      // 없다면 콘솔 로그만 출력
      const { error } = await this.supabase.from('audit_logs').insert({
        action,
        entity_type: entityType,
        entity_id: entityId,
        changes,
        created_at: new Date().toISOString(),
      });

      if (error) {
        // audit_logs 테이블이 없을 수 있으므로 에러는 로그만 출력
        console.warn('Audit log failed (table may not exist):', error);
      }
    } catch (error) {
      console.error('Audit log error:', error);
    }
  }

  /**
   * 여러 액션을 batch로 기록
   */
  async logBatch(
    logs: Array<{
      action: string;
      entityType: string;
      entityId: string;
      changes?: Record<string, unknown>;
    }>
  ): Promise<void> {
    try {
      const records = logs.map((log) => ({
        action: log.action,
        entity_type: log.entityType,
        entity_id: log.entityId,
        changes: log.changes || {},
        created_at: new Date().toISOString(),
      }));

      const { error } = await this.supabase.from('audit_logs').insert(records);

      if (error) {
        console.warn('Batch audit log failed:', error);
      }
    } catch (error) {
      console.error('Batch audit log error:', error);
    }
  }
}
