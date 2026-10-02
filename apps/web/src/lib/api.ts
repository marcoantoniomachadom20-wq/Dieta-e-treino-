/** Cliente HTTP fino: cookies de sessão httpOnly, JSON, erros com mensagem legível. */
export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const isForm = body instanceof FormData;
  const res = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: body && !isForm ? { 'Content-Type': 'application/json' } : undefined,
    body: body == null ? undefined : isForm ? body : JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    if (res.status === 401 && !url.startsWith('/api/auth/')) window.dispatchEvent(new Event('pp:unauthorized'));
    throw new ApiError(res.status, data?.error ?? `Erro ${res.status}`);
  }
  return data as T;
}

export const api = {
  get: <T = any>(url: string) => request<T>('GET', url),
  post: <T = any>(url: string, body?: unknown) => request<T>('POST', url, body ?? {}),
  put: <T = any>(url: string, body?: unknown) => request<T>('PUT', url, body),
  patch: <T = any>(url: string, body?: unknown) => request<T>('PATCH', url, body),
  del: <T = any>(url: string) => request<T>('DELETE', url),
};
