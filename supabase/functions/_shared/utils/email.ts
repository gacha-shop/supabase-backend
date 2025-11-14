/**
 * Email 유틸리티
 * 환영 이메일, 알림 등
 */

/**
 * 환영 이메일 발송
 * TODO: 실제 이메일 서비스 연동 (SendGrid, AWS SES 등)
 */
export async function sendWelcomeEmail(
  email: string,
  fullName: string
): Promise<void> {
  try {
    // 현재는 로그만 출력
    console.log(`[Email] Welcome email to: ${email}, name: ${fullName}`);

    // TODO: 실제 이메일 발송 로직
    // const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    //   method: 'POST',
    //   headers: {
    //     'Authorization': `Bearer ${Deno.env.get('SENDGRID_API_KEY')}`,
    //     'Content-Type': 'application/json',
    //   },
    //   body: JSON.stringify({
    //     personalizations: [{
    //       to: [{ email }],
    //       subject: '가챠스토어 관리자 가입을 환영합니다',
    //     }],
    //     from: { email: 'noreply@gachastore.com' },
    //     content: [{
    //       type: 'text/html',
    //       value: `<p>안녕하세요 ${fullName}님,</p><p>가챠스토어 관리자로 가입해주셔서 감사합니다.</p>`,
    //     }],
    //   }),
    // });
  } catch (error) {
    console.error('Failed to send welcome email:', error);
    // 이메일 발송 실패해도 회원가입은 성공으로 처리
  }
}

/**
 * 승인 완료 이메일 발송
 */
export async function sendApprovalEmail(
  email: string,
  fullName: string
): Promise<void> {
  try {
    console.log(`[Email] Approval email to: ${email}, name: ${fullName}`);

    // TODO: 실제 이메일 발송 로직
  } catch (error) {
    console.error('Failed to send approval email:', error);
  }
}

/**
 * 거부 이메일 발송
 */
export async function sendRejectionEmail(
  email: string,
  fullName: string,
  reason?: string
): Promise<void> {
  try {
    console.log(
      `[Email] Rejection email to: ${email}, name: ${fullName}, reason: ${reason}`
    );

    // TODO: 실제 이메일 발송 로직
  } catch (error) {
    console.error('Failed to send rejection email:', error);
  }
}
