const model = ({ provider, name, apiUrl } = {}) => `

## 模型
- provider: ${provider || ""}
- model: ${name || ""}
- apiUrl: ${apiUrl || ""}`;

export { model };
