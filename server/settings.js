// 界面设置覆盖配置文件；未保存的项保持原配置。
export function advancedDefaults(config) {
    return {
        compactThreshold: String(Math.ceil((config.compaction?.contextWindowTokens || 0) * (config.compaction?.foldRatio ?? 1))),
        toolOutputLimit: String(config.shell?.maxOutputChars || 40000),
        maxRounds: String(config.maxRounds ?? 32),
        compactPrompt: config.compaction?.prompt || '',
    };
}
export function validateAdvanced(input) {
    const values = {};
    for (const [key, min, max] of [['compactThreshold', 0, 10000000], ['toolOutputLimit', 1000, 1000000], ['maxRounds', 0, 10000]]) {
        if (input[key] === undefined) continue;
        const value = input[key];
        if (!['string', 'number'].includes(typeof value) || String(value).trim() === '' || !Number.isSafeInteger(Number(value)) || Number(value) < min || Number(value) > max) throw Object.assign(new Error(`${key} 必须是 ${min}–${max} 的整数`), { status: 400 });
        values[key] = String(Number(value));
    }
    if (input.compactPrompt !== undefined) {
        if (typeof input.compactPrompt !== 'string' || !input.compactPrompt.trim() || input.compactPrompt.length > 30000) throw Object.assign(new Error('压缩提示词不能为空且不能超过 30000 字'), { status: 400 });
        values.compactPrompt = input.compactPrompt;
    }
    return values;
}
export function runtimeSettings(config, saved) {
    const value = { ...advancedDefaults(config), ...saved };
    return {
        maxRounds: Number(value.maxRounds),
        toolOutputLimit: Number(value.toolOutputLimit),
        compaction: { ...config.compaction, contextWindowTokens: Number(value.compactThreshold), foldRatio: 1, prompt: value.compactPrompt },
        shell: { ...config.shell, maxOutputChars: Number(value.toolOutputLimit) },
    };
}
