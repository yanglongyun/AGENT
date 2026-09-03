// 路由共用的两个小帮手。
export const json = (response, status, body) => {
    response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify(body));
};

export const readBody = async (request) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    if (!chunks.length) return {};
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return {}; }
};
