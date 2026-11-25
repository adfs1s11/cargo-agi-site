export function readFailureReason(error) {
  if (error?.code === '57014' && /statement timeout/i.test(error.message)) return '서버 조회 시간 초과';
  if (error?.code === '40001') return '조회 중 원장 변경';
  return '';
}

// Each attempt starts a fresh read. Never pass a save or a cache installation here.
export async function retryWorkspaceRead(read, onRetry, wait = ms => new Promise(resolve => setTimeout(resolve, ms))) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await read(attempt);
    } catch (error) {
      const reason = readFailureReason(error);
      if (!reason || attempt >= 2) throw error;
      onRetry(reason, attempt + 1);
      await wait(600 * 2 ** attempt + Math.random() * 400);
    }
  }
}

export function requireSameRevision(start, end) {
  if (start !== end) {
    const error = new Error('조회 중 원장이 갱신됐습니다.');
    error.code = '40001';
    throw error;
  }
}
