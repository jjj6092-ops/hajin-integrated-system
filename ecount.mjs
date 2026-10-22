const REQUIRED = ['ECOUNT_COM_CODE', 'ECOUNT_USER_ID', 'ECOUNT_API_CERT_KEY'];
export class EcountError extends Error {
  constructor(message, status = 502) { super(message); this.status = status; }
}
export function createEcountClient({ env = process.env, fetcher = fetch, now = Date.now } = {}) {
  let session = null, loginPending = null, nextQueryAt = 0;
  const cache = new Map(), pending = new Map();
  const mode = env.ECOUNT_MODE || 'test';
  const prefix = mode === 'production' ? 'oapi' : 'sboapi';
  function configuration() {
    const missing = REQUIRED.filter(name => !String(env[name] || '').trim());
    return { configured: !missing.length && ['test', 'production'].includes(mode), missing, mode, modeValid: ['test', 'production'].includes(mode) };
  }
  async function post(url, payload) {
    let response;
    try { response = await fetcher(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(15000), redirect: 'error' }); }
    catch { throw new EcountError('이카운트 서버에 연결하지 못했습니다. 네트워크와 허용 IP를 확인하세요.'); }
    if (!response.ok) throw new EcountError('이카운트 요청이 거절되었습니다. API 이용 권한과 허용 IP를 확인하세요.');
    let result;
    try { result = await response.json(); } catch { throw new EcountError('이카운트 응답 형식을 확인할 수 없습니다.'); }
    if (Number(result.Status) !== 200 || result.Error || !result.Data || result.Data.IsSuccess === false) {
      // Never forward upstream bodies: they can include authentication values.
      throw new EcountError('이카운트 API가 요청을 처리하지 못했습니다. 인증키 유효기간·API 권한·조회 조건을 확인하세요.');
    }
    return result.Data;
  }
  async function login() {
    if (session && session.expires > now()) return session;
    if (loginPending) return loginPending;
    loginPending = (async () => {
      const config = configuration();
      if (!config.configured) throw new EcountError('이카운트 연동 환경변수 설정이 필요합니다.', 503);
      const company = String(env.ECOUNT_COM_CODE).trim();
      const zoneData = await post(`https://${prefix}.ecount.com/OAPI/V2/Zone`, { COM_CODE: company });
      const zone = String(zoneData.ZONE || '');
      if (!/^[a-zA-Z0-9]{1,6}$/.test(zone)) throw new EcountError('이카운트 Zone 응답이 올바르지 않습니다.');
      // Hostname is constructed from a validated Zone, not upstream DOMAIN.
      const base = `https://${prefix}${zone}.ecount.com`;
      const data = await post(`${base}/OAPI/V2/OAPILogin`, { COM_CODE: company, USER_ID: String(env.ECOUNT_USER_ID).trim(), API_CERT_KEY: String(env.ECOUNT_API_CERT_KEY).trim(), LAN_TYPE: 'ko-KR', ZONE: zone });
      if (typeof data.SESSION_ID !== 'string' || !data.SESSION_ID) throw new EcountError('이카운트 로그인 세션을 받지 못했습니다.');
      session = { id: data.SESSION_ID, base, expires: now() + 10 * 60 * 1000 };
      return session;
    })();
    try { return await loginPending; } finally { loginPending = null; }
  }
  async function inventory(filters) {
    if (!configuration().configured) throw new EcountError('이카운트 연동 환경변수 설정이 필요합니다.', 503);
    const key = JSON.stringify(filters), cached = cache.get(key);
    if (cached && cached.until > now()) return { ...cached.value, cached: true };
    if (pending.has(key)) return pending.get(key);
    if (now() < nextQueryAt) throw new EcountError('API 호출 간격을 위해 잠시 후 다시 조회해 주세요.', 429);
    nextQueryAt = now() + 5000;
    const operation = (async () => {
      const auth = await login();
      let result;
      try { result = await post(`${auth.base}/OAPI/V2/InventoryBalance/GetListInventoryBalanceStatusByLocation?SESSION_ID=${encodeURIComponent(auth.id)}`, filters); }
      catch (error) { session = null; throw error; }
      let rows = result.Result;
      if (typeof rows === 'string') { try { rows = JSON.parse(rows); } catch { throw new EcountError('이카운트 재고 응답 형식을 확인할 수 없습니다.'); } }
      if (!Array.isArray(rows) || rows.length > 50000) throw new EcountError('이카운트 재고 목록 형식을 확인할 수 없습니다.');
      const data = rows.map(row => {
        if (!row || typeof row !== 'object' || row.BAL_QTY === null || row.BAL_QTY === undefined || String(row.BAL_QTY).trim() === '' || !Number.isFinite(Number(row.BAL_QTY))) throw new EcountError('이카운트 재고 수량 형식을 확인할 수 없습니다.');
        return { warehouseCode: String(row.WH_CD ?? ''), warehouseName: String(row.WH_DES ?? ''), productCode: String(row.PROD_CD ?? ''), productName: String(row.PROD_DES ?? ''), specification: String(row.PROD_SIZE_DES ?? ''), quantity: Number(row.BAL_QTY) };
      });
      const total = Number(result.TotalCnt);
      if (Number.isFinite(total) && total !== data.length) throw new EcountError('이카운트 응답 건수와 목록이 다릅니다. 창고·품목 조건을 좁혀 다시 조회하세요.');
      const value = { rows: data, total: data.length, fetchedAt: new Date(now()).toISOString(), baseDate: filters.BASE_DATE, mode, cached: false };
      if (cache.size >= 100) cache.delete(cache.keys().next().value);
      cache.set(key, { until: now() + 60000, value });
      return value;
    })();
    pending.set(key, operation);
    try { return await operation; } finally { pending.delete(key); }
  }
  return { configuration, inventory };
}
export function inventoryFilters(params) {
  const date = params.get('date') || new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw new EcountError('올바른 조회 기준일을 선택하세요.', 400);
  const codes = (name, max) => {
    const values = (params.get(name) || '').split(',').map(s => s.trim()).filter(Boolean);
    if (values.length > max || values.some(v => v.length > 20 || /[\x00-\x1f]/.test(v))) throw new EcountError(`${name === 'warehouses' ? '창고' : '품목'}는 최대 ${max}개의 코드로 조회하세요. 코드는 20자 이하입니다.`, 400);
    return [...new Set(values)].join(',');
  };
  const includeZero = params.get('includeZero') || 'N';
  if (!['Y', 'N'].includes(includeZero)) throw new EcountError('재고 0 포함 조건이 올바르지 않습니다.', 400);
  return { BASE_DATE: date.replaceAll('-', ''), WH_CD: codes('warehouses', 1), PROD_CD: codes('products', 1), ZERO_FLAG: includeZero, BAL_FLAG: 'N', DEL_GUBUN: 'N', DEL_LOCATION_YN: 'N' };
}
