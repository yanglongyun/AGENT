// 附件:上传进本地文件区,按 id 取回。
import { json, readBody } from './helpers.js';

export async function route({ method, path, segments, request, response, files }) {
    if (method === 'GET' && segments[1] === 'files' && segments[2]) {
        if (await files.serve(segments[2], response)) return true;
        json(response, 404, { error: '文件不存在' }); return true;
    }
    if (method === 'POST' && path === '/api/files') {
        const attachment = await files.upload(await readBody(request));
        json(response, 201, { attachment }); return true;
    }
    return false;
}
