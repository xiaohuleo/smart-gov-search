import { NextResponse } from "next/server";

// 🚀 启用 Edge Runtime，解决冷启动慢的问题
export const runtime = 'edge';

export async function POST(req) {
  try {
    const { query, candidates, config } = await req.json();

    if (!config.apiKey || !config.baseUrl) {
      return NextResponse.json({ error: "配置缺失" }, { status: 400 });
    }

    // 构建 Prompt：要求 AI 返回纯 JSON
    const systemPrompt = `你是一个相关性评分器。用户搜索: "${query}"。
    请判断以下候选列表(ID和名称)与搜索意图的相关性(0.0-1.0)。
    必须严格返回 JSON 对象，格式：{"scores": {"编码1": 0.9, "编码2": 0.1}}。
    不要解释，只要 JSON。`;

    // 拼接 API 地址 (兼容 OpenAI 格式)
    const apiUrl = `${config.baseUrl.replace(/\/$/, '')}/chat/completions`;

    // 后端发起请求 (服务器 -> 服务器，无 CORS 限制)
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
          { role: "user", content: JSON.stringify(candidates) }
        ],
        temperature: 0.1, // 低温度保证 JSON 格式稳定
        response_format: { type: "json_object" } // 尝试强制 JSON
      })
    });

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      return NextResponse.json({ error: `API Error ${apiRes.status}: ${errText}` }, { status: 500 });
    }

    const apiJson = await apiRes.json();
    const content = apiJson.choices[0].message.content;

    // 清洗和解析 JSON
    const cleanContent = content.replace(/```json/g, '').replace(/```/g, '').trim();
    let scores = {};
    
    try {
      const parsed = JSON.parse(cleanContent);
      // 兼容两种返回格式: { "scores": {...} } 或直接 { "id": score }
      if (parsed.scores) {
        scores = parsed.scores;
      } else if (parsed.results) {
         // 兼容数组格式
         parsed.results.forEach(r => scores[r.id] = r.s);
      } else {
        scores = parsed;
      }
    } catch (e) {
      console.error("JSON Parse Error", cleanContent);
      // 如果解析失败，返回空分，前端会依靠硬规则排序
    }

    return NextResponse.json({ scores });

  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
