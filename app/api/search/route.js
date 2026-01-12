import { NextResponse } from "next/server";

export async function POST(req) {
  try {
    const { query, items, context, config } = await req.json();

    // 1. 安全检查
    if (!config.apiKey || !config.baseUrl) {
      return NextResponse.json({ error: "API 配置缺失" }, { status: 400 });
    }

    // 2. 准备数据 (为了速度和Token节省，只取前20条进行AI重排)
    const candidates = items.slice(0, 20).map(item => ({
      id: item['事项编码'],
      n: item['事项名称'], // 缩写key以节省token
      d: (item['事项描述'] || item['事项名称']).substring(0, 100), // 截断描述
      sat: item['满意度'],
      hot: item['是否高频事项']
    }));

    // 3. 构建 Prompt
    const systemPrompt = `你是一个政务搜索排序引擎。用户输入查询，你需从候选列表中选出最相关的项。
    用户画像: 角色[${context.userRole}], 位置[${context.location}]。
    排序逻辑:
    1. 语义最相关优先。
    2. 如果开启高频[${context.useHotness}]，hot='是'的加分。
    3. 如果开启满意度[${context.useSatisfaction}]，sat分高的加分。
    4. 必须返回纯 JSON 数组，格式: [{"id":"编码","score":0.9,"reason":"简短理由"}]。`;

    const userPrompt = `查询: "${query}"
    候选数据: ${JSON.stringify(candidates)}`;

    // 4. 调用第三方 API (通用 Fetch)
    // 注意：大多数兼容 OpenAI 的接口都使用 /chat/completions 路径
    // 如果 config.baseUrl 结尾没有 /chat/completions，我们需要尝试自动处理，但这里为了简单，
    // 我们假设 config.baseUrl 是直到 /v1 的路径 (如 https://api.groq.com/openai/v1)
    
    const apiUrl = `${config.baseUrl.replace(/\/$/, '')}/chat/completions`;

    const apiRes = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.1, // 低温度以保证 JSON 格式稳定
        response_format: { type: "json_object" } // 尝试强制 JSON 模式 (部分模型支持)
      })
    });

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      throw new Error(`Model API Error: ${apiRes.status} - ${errText}`);
    }

    const apiJson = await apiRes.json();
    const content = apiJson.choices[0].message.content;

    // 5. 解析 AI 返回的 JSON
    // 有些模型可能包含 ```json 包裹，需要清洗
    const cleanContent = content.replace(/```json/g, '').replace(/```/g, '').trim();
    let rankedItems = [];
    try {
        const parsed = JSON.parse(cleanContent);
        // 兼容返回可能是 { results: [...] } 或者直接是 [...]
        rankedItems = Array.isArray(parsed) ? parsed : (parsed.results || []);
    } catch (e) {
        console.error("JSON Parse Fail:", cleanContent);
        return NextResponse.json({ results: [], error: "AI 返回格式错误" });
    }

    // 6. 回填详细信息给前端
    const finalResults = rankedItems.map(r => {
        const original = items.find(i => i['事项编码'] === r.id);
        if (!original) return null;
        return {
            name: original['事项名称'],
            description: original['事项描述'],
            score: r.score,
            reason: r.reason
        };
    }).filter(Boolean);

    // 按分数降序
    finalResults.sort((a, b) => b.score - a.score);

    return NextResponse.json({ results: finalResults });

  } catch (error) {
    console.error("Proxy Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
