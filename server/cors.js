// app 的 iframe 是不透明源(sandbox 不给 allow-same-origin),它发出的请求
// Origin 是 null,一律算跨源。凡是 app 能打到的路由都要过这里。
export function applyCors(response) {
    response.setHeader('access-control-allow-origin', '*');
    response.setHeader('access-control-allow-headers', 'content-type, authorization');
    response.setHeader('access-control-allow-methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    response.setHeader('access-control-max-age', '86400');
}

/** 预检直接在这儿了结,不往下走。 */
export function handlePreflight(request, response) {
    if ((request.method || 'GET') !== 'OPTIONS') return false;
    applyCors(response);
    response.writeHead(204);
    response.end();
    return true;
}
